import { NextResponse } from 'next/server';
import { authorize } from '@/lib/apiAuth';
import { loadGrowth } from '@/lib/growthLoad';
import { recordTouch } from '@/lib/growthStore';
import { updateEnquiry, appendEnquiryNote } from '@/lib/notion';
import { reengagementQueue, todayIso, addDays, prettyDate, TOUCHES } from '@/lib/growth';
import { logActivity } from '@/lib/activityLog';

// Directors only: who to follow up today, with a drafted message for each.
// The app never sends — Ruds opens WhatsApp/email with the draft, edits it if
// he wants, sends it himself, then marks it here.
export const dynamic = 'force-dynamic';

// Proof to drop into drafts: the latest posted real-event and "what's
// included" posts that have an Instagram link.
function pickLink(content, pillar) {
  return content
    .filter(c => c.pillar === pillar && c.status === 'Posted' && c.postUrl)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]?.postUrl || '';
}

export async function GET() {
  const { deny } = await authorize(['director']);
  if (deny) return deny;
  try {
    const d = await loadGrowth();
    const today = todayIso();
    const queue = reengagementQueue({
      enquiries: d.enquiries, bookings: d.bookings, touches: d.touches, today,
      proofLink: pickLink(d.content, 'Proof - real events'),
      includedLink: pickLink(d.content, 'What is included'),
    });
    const recentTouches = d.touches.slice(0, 25).map(t => ({
      ...t,
      name: d.enquiries.find(e => e.id === t.enquiry_id)?.name || '',
      label: TOUCHES.find(x => x.key === t.touch_key)?.label || t.touch_key,
    }));
    return NextResponse.json({ today, queue, recentTouches });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}

export async function POST(request) {
  const { user, deny } = await authorize(['director']);
  if (deny) return deny;
  const b = await request.json().catch(() => ({}));
  const touch = TOUCHES.find(t => t.key === b.touchKey);
  if (!b.enquiryId || !touch || !['sent', 'skipped', 'snoozed'].includes(b.action)) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const today = todayIso();
  const snoozeDays = Math.min(60, Math.max(1, parseInt(b.snoozeDays, 10) || 7));
  try {
    await recordTouch({
      enquiry_id: b.enquiryId, touch_key: touch.key, action: b.action,
      snooze_until: b.action === 'snoozed' ? addDays(today, snoozeDays) : null,
      by_email: user.email, note: String(b.note || '').slice(0, 500) || null,
    });
    if (b.action === 'sent') {
      // Replying to a brand-new enquiry moves it on; everything else keeps its
      // status. Either way the enquiry's notes get a dated line.
      if (touch.key === 'r1') await updateEnquiry(b.enquiryId, { status: 'Contacted' }).catch(() => {});
      await appendEnquiryNote(b.enquiryId, `${prettyDate(today, { year: true })}: follow-up sent (${touch.label}) by ${user.email.split('@')[0]}.`).catch(() => {});
    }
    await logActivity({ userEmail: user.email, action: `growth.touch.${b.action}`, target: b.name || b.enquiryId, detail: touch.label });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
