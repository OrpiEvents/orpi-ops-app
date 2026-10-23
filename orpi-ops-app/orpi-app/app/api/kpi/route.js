import { roleOf } from '@/lib/roles';
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
  if (roleOf(user) !== 'director') return NextResponse.json({ error: 'Your login doesn’t have access to this.' }, { status: 403 });

  try {
    const [enquiries, bookings, costs] = await Promise.all([
      listEnquiries(),
      listAllBookings(),
      listAllCosts(),
    ]);
    // Overheads live in the app's own store now (edited on the Overheads page),
    // read from app_state — reliable and not dependent on a Notion integration.
    let fixedCosts = [];
    try {
      const { data: fc } = await supabase.from('app_state').select('value').eq('key', 'fixed_costs').maybeSingle();
      if (Array.isArray(fc?.value)) fixedCosts = fc.value;
    } catch { /* leave empty */ }
    return NextResponse.json({ enquiries, bookings, costs, fixedCosts });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
