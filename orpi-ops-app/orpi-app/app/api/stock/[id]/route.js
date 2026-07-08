import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { updateInventoryStock } from '@/lib/notion';
import { logActivity } from '@/lib/activityLog';

// PATCH { currentStock, itemName } — used for both the quick +/- adjust on
// the Stock tracker page and each row save on the Stock take page.
export async function PATCH(request, { params }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { currentStock, itemName } = await request.json();
  if (currentStock === undefined) return NextResponse.json({ error: 'currentStock is required' }, { status: 400 });

  try {
    const item = await updateInventoryStock(params.id, Number(currentStock));
    await logActivity({
      userEmail: user.email,
      action: 'stock.adjust',
      target: itemName || item.name,
      detail: `set to ${currentStock}`,
    });
    return NextResponse.json({ item });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
