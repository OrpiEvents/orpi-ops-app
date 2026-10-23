import { NextResponse } from 'next/server';
import { cronAllowed } from '@/lib/apiAuth';
import { runGrowthSync } from '@/lib/growthSync';

// Daily (vercel.json): pipeline snapshot, Instagram + ads numbers, and the
// Content Calendar write-back. Read-only towards Meta; sends no messages.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request) {
  const gate = cronAllowed(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const report = await runGrowthSync();
  return NextResponse.json(report, { status: report.ok ? 200 : 207 });
}
