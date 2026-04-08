import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type');
  const id = req.nextUrl.searchParams.get('id');

  try {
    if (type && id) {
      // Single series/ticker fetch (used for initial bulk load from the UI)
      const { refreshSingleSeries } = await import('@/lib/data/cache');
      const result = await refreshSingleSeries(type as 'fred' | 'eodhd', id);
      return NextResponse.json(result);
    }

    // Fast parallel refresh (used for daily updates when data already exists)
    const { initializeDatabase } = await import('@/lib/db');
    await initializeDatabase();
    const { refreshAllFast } = await import('@/lib/data/cache');
    const result = await refreshAllFast();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, errors: [message] }, { status: 500 });
  }
}
