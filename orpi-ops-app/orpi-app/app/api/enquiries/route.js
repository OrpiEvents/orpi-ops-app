import { roleOf } from '@/lib/roles';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { listEnquiries, createEnquiry } from '@/lib/notion';
import { logActivity } from '@/lib/activityLog';

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (roleOf(user) !== 'director') return NextResponse.json({ error: 'Your login doesn’t have access to this.' }, { status: 403 });

  try {
    const enquiries = await listEnquiries();
    return NextResponse.json({ enquiries });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}

export async function POST(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (roleOf(user) !== 'director') return NextResponse.json({ error: 'Your login doesn’t have access to this.' }, { status: 403 });

  const body = await request.json();
  if (!body?.name) return NextResponse.json({ error: 'Client name is required' }, { status: 400 });

  try {
    const enquiry = await createEnquiry(body);
    await logActivity({
      userEmail: user.email,
      action: 'enquiry.create',
      target: enquiry.name,
    });
    return NextResponse.json({ enquiry });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
