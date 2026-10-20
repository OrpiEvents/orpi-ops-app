// GET /api/invoices/[token]  — public read of a single invoice (the token is
// the capability). Returns only the client-safe view; never the author email.
import { NextResponse } from 'next/server';
import { getInvoice, publicView } from '@/lib/invoices';

export async function GET(request, { params }) {
  try {
    const record = await getInvoice(params.token);
    if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ invoice: publicView(record) });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
