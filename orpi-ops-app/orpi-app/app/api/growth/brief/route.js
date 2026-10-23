import { NextResponse } from 'next/server';
import { authorize } from '@/lib/apiAuth';
import { loadGrowth } from '@/lib/growthLoad';
import { buildBrief, briefToText } from '@/lib/brief';

// The weekly brief, built live from the data. Role-aware: a marketing login
// gets content, social, ads and learnings; directors also get the pipeline.
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { role, deny } = await authorize(['director', 'marketing']);
  if (deny) return deny;
  try {
    const d = await loadGrowth();
    const brief = buildBrief({ ...d, role });
    if (request.nextUrl.searchParams.get('format') === 'text') {
      return new NextResponse(briefToText(brief), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    return NextResponse.json(brief);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
