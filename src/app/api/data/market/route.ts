import { NextResponse } from 'next/server';

export const maxDuration = 60;

/**
 * GET /api/data/market
 * Returns a slimmed-down MarketData object for client-side backtesting.
 * Only sends fields needed by the engine (date + adjusted_close + volume + high for prices,
 * date + value for FRED). Cuts payload size by ~60%.
 */
export async function GET() {
  try {
    const { buildMarketData } = await import('@/lib/data/cache');
    const data = await buildMarketData();

    // Slim down price data: only keep fields the engine actually uses
    const slimPrices: Record<string, { date: string; adjusted_close: number; close: number; high: number; low: number; open: number; volume: number }[]> = {};
    for (const [ticker, rows] of Object.entries(data.prices)) {
      slimPrices[ticker] = rows.map(r => ({
        date: r.date,
        open: r.open,
        high: r.high,
        low: r.low,
        close: r.close,
        volume: r.volume,
        adjusted_close: r.adjusted_close,
      }));
    }

    return NextResponse.json({
      prices: slimPrices,
      fred: data.fred,
      computed: {},
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Market data error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
