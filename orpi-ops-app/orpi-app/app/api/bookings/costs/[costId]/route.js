import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { deleteBookingCost } from '@/lib/notion';
import { logActivity } from '@/lib/activityLog';

export async function DELETE(request, { params }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  try {
    await deleteBookingCost(params.costId);
    await logActivity({ userEmail: user.email, action: 'booking.cost_remove', target: params.costId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
