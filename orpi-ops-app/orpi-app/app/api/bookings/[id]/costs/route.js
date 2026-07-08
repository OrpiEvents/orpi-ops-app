import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { listBookingCosts, createBookingCost } from '@/lib/notion';
import { logActivity } from '@/lib/activityLog';

export async function GET(request, { params }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  try {
    const costs = await listBookingCosts(params.id);
    return NextResponse.json({ costs });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}

export async function POST(request, { params }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const body = await request.json();
  if (!body?.name) return NextResponse.json({ error: 'Cost description is required' }, { status: 400 });

  try {
    const cost = await createBookingCost(params.id, body);
    await logActivity({
      userEmail: user.email,
      action: 'booking.cost_add',
      target: body.name,
      detail: `${body.costType || 'Uncategorised'} — £${body.cost || 0}`,
    });
    return NextResponse.json({ cost });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
