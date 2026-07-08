import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { listPurchases, createPurchase, createInventoryItem } from '@/lib/notion';
import { logActivity } from '@/lib/activityLog';

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  try {
    const purchases = await listPurchases();
    return NextResponse.json({ purchases });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}

// POST — logs a purchase. If inventoryItemId is omitted but newItem details
// are provided, creates the inventory item first, then links the purchase
// to it. Either way, the linked item's Current Stock is bumped automatically.
export async function POST(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const body = await request.json();
  const { inventoryItemId, newItem, itemName, quantity, unitCost, supplier, dateBought, ownedBy } = body;

  if (!itemName || !quantity) {
    return NextResponse.json({ error: 'itemName and quantity are required' }, { status: 400 });
  }

  try {
    let linkedId = inventoryItemId;
    if (!linkedId && newItem) {
      const created = await createInventoryItem({ name: itemName, ...newItem, currentStock: 0 });
      linkedId = created.id;
    }
    const purchase = await createPurchase({
      inventoryItemId: linkedId, itemName, quantity, unitCost, supplier, dateBought, ownedBy,
    });
    await logActivity({
      userEmail: user.email,
      action: 'purchase.create',
      target: itemName,
      detail: `qty ${quantity} @ £${unitCost || 0} from ${supplier || 'unspecified'}`,
    });
    return NextResponse.json({ purchase });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
