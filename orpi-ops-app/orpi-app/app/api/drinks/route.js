import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { listDrinks } from '@/lib/notion';

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  try {
    const drinks = await listDrinks();
    return NextResponse.json({ drinks });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
