import { NextResponse } from 'next/server';
import { authorize } from '@/lib/apiAuth';
import { createAdminClient } from '@/lib/supabaseServer';
import { roleOf, ROLES } from '@/lib/roles';
import { securityStatus } from '@/lib/growthStore';
import { sendEmail, canEmail } from '@/lib/mailer';
import { logActivity } from '@/lib/activityLog';

// Team: directors invite people, set their role and send password links.
// Links are one-time Supabase tokens that land on /welcome, where the person
// chooses their own password — nobody else ever sees or sets it.
export const dynamic = 'force-dynamic';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ASSIGNABLE = ['director', 'marketing', 'disabled'];

async function listTeam() {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw new Error(error.message);
  return (data?.users || []).map(u => ({
    id: u.id,
    email: u.email,
    role: roleOf(u),
    roleSet: u.app_metadata?.role || null,
    lastSignIn: u.last_sign_in_at,
    createdAt: u.created_at,
    invitedOnly: !u.last_sign_in_at,
  })).sort((a, b) => a.email.localeCompare(b.email));
}

function welcomeLink(origin, props) {
  const type = ['invite', 'recovery', 'magiclink', 'signup'].includes(props?.verification_type) ? props.verification_type : 'recovery';
  return `${origin}/welcome?token_hash=${encodeURIComponent(props.hashed_token)}&type=${type}`;
}

export async function GET() {
  const { deny } = await authorize(['director']);
  if (deny) return deny;
  try {
    const [team, security] = await Promise.all([listTeam(), securityStatus()]);
    return NextResponse.json({ team, security, canEmail: canEmail(), roles: ROLES });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}

export async function POST(request) {
  const { user, deny } = await authorize(['director']);
  if (deny) return deny;
  const body = await request.json().catch(() => ({}));
  const origin = (process.env.BOOKING_ORIGIN || request.nextUrl.origin).replace(/\/+$/, '');
  const admin = createAdminClient();

  try {
    if (body.action === 'invite' || body.action === 'link') {
      const email = String(body.email || '').trim().toLowerCase();
      if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'Check the email address.' }, { status: 400 });
      const role = body.action === 'invite' ? body.role : null;
      if (role && !['director', 'marketing'].includes(role)) return NextResponse.json({ error: 'Pick a role.' }, { status: 400 });

      if (role === 'marketing') {
        const sec = await securityStatus();
        if (!sec.app_state_director_only || !sec.activity_log_director_only) {
          return NextResponse.json({
            error: 'Not yet: the app’s saved data (quotes, invoices, overheads, run sheets, activity log) can still be read by any login. Apply the “directors only” database change first — it’s in the Connections page checklist — then invite again.',
            blocked: 'security',
          }, { status: 409 });
        }
      }

      // New person → invite link; existing person → password link.
      let { data, error } = await admin.auth.admin.generateLink({ type: 'invite', email });
      if (error && /already|registered|exists/i.test(error.message)) {
        ({ data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email }));
      }
      if (error) throw new Error(error.message);
      const target = data.user;
      if (role && target?.id) {
        const { error: e2 } = await admin.auth.admin.updateUserById(target.id, { app_metadata: { ...(target.app_metadata || {}), role } });
        if (e2) throw new Error(e2.message);
      }
      const link = welcomeLink(origin, data.properties);
      let emailed = false;
      if (canEmail()) {
        try {
          await sendEmail({
            to: email,
            subject: role ? 'You’ve been invited to ORPI Ops' : 'Your ORPI Ops password link',
            text: [
              'Hi,',
              '',
              role
                ? `${user.email} has given you access to the ORPI Events ops app${role === 'marketing' ? ' (the Growth workspace: content, links, Instagram and ads)' : ''}.`
                : 'Here’s your link to set a new password for the ORPI Events ops app.',
              '',
              'Choose your password here (the link works once, and expires after about an hour):',
              link,
              '',
              'If it’s expired, just ask for a new one.',
              '',
              'ORPI Events',
            ].join('\n'),
          });
          emailed = true;
        } catch { /* show the link instead */ }
      }
      await logActivity({ userEmail: user.email, action: role ? 'team.invite' : 'team.password-link', target: email, detail: role ? `role: ${role}` : null });
      return NextResponse.json({ ok: true, link, emailed, team: await listTeam() });
    }

    if (body.action === 'role') {
      const role = body.role;
      if (!ASSIGNABLE.includes(role)) return NextResponse.json({ error: 'Unknown role.' }, { status: 400 });
      if (body.id === user.id && role !== 'director') return NextResponse.json({ error: 'You can’t remove your own director access.' }, { status: 400 });
      if (role === 'marketing') {
        const sec = await securityStatus();
        if (!sec.app_state_director_only || !sec.activity_log_director_only) {
          return NextResponse.json({ error: 'Apply the “directors only” database change before giving anyone a marketing login.', blocked: 'security' }, { status: 409 });
        }
      }
      const { data: got, error: e1 } = await admin.auth.admin.getUserById(body.id);
      if (e1 || !got?.user) throw new Error(e1?.message || 'User not found');
      const { error } = await admin.auth.admin.updateUserById(body.id, { app_metadata: { ...(got.user.app_metadata || {}), role } });
      if (error) throw new Error(error.message);
      await logActivity({ userEmail: user.email, action: 'team.role', target: got.user.email, detail: `role: ${role}` });
      return NextResponse.json({ ok: true, team: await listTeam() });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
