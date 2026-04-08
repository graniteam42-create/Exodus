import { NextResponse } from 'next/server';

export const maxDuration = 30;

/**
 * GET /api/data/market
 * Returns the full MarketData object for client-side backtesting.
 * This is fetched once and used for all strategy evaluations in the browser.
 */
export async function GET() {
  try {
    const { buildMarketData } = await import('@/lib/data/cache');
    const data = await buildMarketData();
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
