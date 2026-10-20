// POST /api/invoices/[token]/accept  — public. Records the client's typed
// acceptance of the Terms (name + timestamp + IP + terms version) before they
// pay the deposit. Idempotent: the first acceptance stands.
import { NextResponse } from 'next/server';
import { recordAcceptance, publicView } from '@/lib/invoices';
import { logActivity } from '@/lib/activityLog';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  let body;
  try { body = await request.json(); } catch { body = {}; }
  const name = String((body && body.name) || '').trim();
  const agree = !!(body && body.agree);
  if (name.length < 2) return NextResponse.json({ error: 'Please type your full name.' }, { status: 400 });
  if (!agree) return NextResponse.json({ error: 'Please tick the box to confirm you accept the terms.' }, { status: 400 });

  const fwd = request.headers.get('x-forwarded-for');
  const ip = (fwd ? fwd.split(',')[0].trim() : null) || request.headers.get('x-real-ip') || null;

  try {
    const res = await recordAcceptance(params.token, { name, ip });
    if (res.notFound) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (res.revoked) return NextResponse.json({ error: 'This link has been replaced by a newer one — please use the latest link from ORPI.' }, { status: 410 });
    if (res.expired) return NextResponse.json({ error: 'This link has expired — please contact ORPI for an up-to-date link.' }, { status: 410 });
    if (!res.already) {
      await logActivity({
        userEmail: 'client',
        action: 'invoice.accepted',
        target: res.record.client,
        detail: `Terms accepted by ${res.record.agreement.name} (v${res.record.agreement.termsVersion})`,
      });
    }
    return NextResponse.json({ invoice: publicView(res.record), already: !!res.already });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
