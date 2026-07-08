import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { updateBooking } from '@/lib/notion';
import { logActivity } from '@/lib/activityLog';

export async function PATCH(request, { params }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const body = await request.json();

  try {
    const booking = await updateBooking(params.id, body);
    await logActivity({
      userEmail: user.email,
      action: 'booking.update',
      target: booking.name,
      detail: JSON.stringify(Object.keys(body)),
    });
    return NextResponse.json({ booking });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
