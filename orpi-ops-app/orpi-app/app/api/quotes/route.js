import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { saveQuoteResult } from '@/lib/notion';
import { logActivity } from '@/lib/activityLog';

export async function POST(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { enquiryId, name, amount, doctype } = await request.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Client name is required' }, { status: 400 });

  try {
    const enquiry = await saveQuoteResult({ enquiryId, name, amount: amount || 0 });
    await logActivity({
      userEmail: user.email,
      action: 'quote.save',
      target: name,
      detail: `${doctype || 'quote'} — ${amount ? `£${amount}` : 'no amount set'}`,
    });
    return NextResponse.json({ enquiry });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
