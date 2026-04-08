import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type');
  const id = req.nextUrl.searchParams.get('id');

  try {
    if (type && id) {
      // Single series/ticker fetch
      const { refreshSingleSeries } = await import('@/lib/data/cache');
      const result = await refreshSingleSeries(type as 'fred' | 'eodhd', id);
      return NextResponse.json(result);
    }

    // Full refresh (legacy, may timeout)
    const { initializeDatabase } = await import('@/lib/db');
    await initializeDatabase();
    const { refreshAllData } = await import('@/lib/data/cache');
    const result = await refreshAllData();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, errors: [message] }, { status: 500 });
  }
}
