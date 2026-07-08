import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { listInventoryItems, createInventoryItem } from '@/lib/notion';
import { logActivity } from '@/lib/activityLog';

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  try {
    const items = await listInventoryItems();
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}

// POST — create a brand new inventory item (used when logging a purchase
// for something not already in the system).
export async function POST(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const body = await request.json();
  if (!body?.name) return NextResponse.json({ error: 'Item name is required' }, { status: 400 });

  try {
    const item = await createInventoryItem(body);
    await logActivity({ userEmail: user.email, action: 'stock.create_item', target: item.name });
    return NextResponse.json({ item });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
