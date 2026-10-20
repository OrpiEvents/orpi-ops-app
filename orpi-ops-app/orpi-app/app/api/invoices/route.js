// POST /api/invoices  — create a client signing link from an agreed quote.
// Authed: only a signed-in ORPI user can mint a link. The snapshot is
// sanitised inside createInvoice() before it is ever stored.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { createInvoice } from '@/lib/invoices';
import { logActivity } from '@/lib/activityLog';

export async function POST(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }); }
  const { enquiryId, snapshot } = body || {};
  if (!snapshot || !snapshot.s) return NextResponse.json({ error: 'Missing quote snapshot' }, { status: 400 });
  if (!snapshot.s.client || !snapshot.s.client.trim()) {
    return NextResponse.json({ error: 'Add a client name before creating a signing link' }, { status: 400 });
  }

  try {
    const record = await createInvoice({ snapshot, enquiryId, createdByEmail: user.email });
    const url = `${request.nextUrl.origin}/i/${record.token}`;
    await logActivity({
      userEmail: user.email,
      action: 'invoice.link',
      target: record.client,
      detail: `Signing link created — deposit ${record.snapshot.dep ? '£' + Math.round(record.snapshot.dep).toLocaleString('en-GB') : 'n/a'}`,
    });
    return NextResponse.json({ token: record.token, url });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
