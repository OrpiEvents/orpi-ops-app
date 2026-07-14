import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { listEnquiries, listAllBookings, listAllCosts } from '@/lib/notion';

// Single endpoint powering the KPI dashboard so the client only makes one
// round-trip. Fetches enquiries (for pipeline stats), every booking (for
// forward-looking + historical revenue), and every cost line (so we can
// split alcohol CPH from operational CPH per completed event).
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  try {
    const [enquiries, bookings, costs] = await Promise.all([
      listEnquiries(),
      listAllBookings(),
      listAllCosts(),
    ]);
    return NextResponse.json({ enquiries, bookings, costs });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
