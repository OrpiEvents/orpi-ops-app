import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { listConfirmedBookings, createBookingFromEnquiry, updateEnquiry } from '@/lib/notion';
import { logActivity } from '@/lib/activityLog';

// GET /api/bookings — real, live Confirmed Bookings from Notion. No sample
// fallback: if Notion can't be reached, the frontend shows a clear error
// instead of quietly displaying fake data.
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  try {
    const bookings = await listConfirmedBookings();
    return NextResponse.json({ bookings });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}

// POST /api/bookings — body: { enquiry: {...} } — creates the Confirmed
// Booking record from a won enquiry, and marks the enquiry Won in the process.
export async function POST(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { enquiry } = await request.json();
  if (!enquiry?.id) return NextResponse.json({ error: 'enquiry is required' }, { status: 400 });

  try {
    const booking = await createBookingFromEnquiry(enquiry);
    await updateEnquiry(enquiry.id, { status: 'Won' });
    await logActivity({
      userEmail: user.email,
      action: 'booking.create_from_enquiry',
      target: booking.name,
    });
    return NextResponse.json({ booking });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
