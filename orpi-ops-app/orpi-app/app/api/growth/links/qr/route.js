import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { authorize } from '@/lib/apiAuth';
import { SLUG_RE } from '@/lib/tracking';

// QR code (SVG) for a tracked link — for bar signage, menus and cards, so
// guests who scan at an event are counted as "Saw ORPI at an event".
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { deny } = await authorize(['director', 'marketing']);
  if (deny) return deny;
  const slug = request.nextUrl.searchParams.get('slug') || '';
  if (!SLUG_RE.test(slug)) return NextResponse.json({ error: 'Unknown link' }, { status: 400 });
  const origin = (process.env.GROWTH_LINK_ORIGIN || request.nextUrl.origin).replace(/\/+$/, '');
  const svg = await QRCode.toString(`${origin}/go/${slug}`, { type: 'svg', margin: 2, errorCorrectionLevel: 'M', color: { dark: '#080808', light: '#ffffff' } });
  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Content-Disposition': `inline; filename="orpi-${slug}-qr.svg"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
