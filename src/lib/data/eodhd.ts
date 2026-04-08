/**
 * EODHD (End-of-Day Historical Data) API fetcher.
 *
 * Requires the EODHD_API_KEY environment variable.
 */

import type { PriceRow } from '@/lib/types';

export interface EodhdTickerConfig {
  ticker: string;   // API ticker including exchange suffix, e.g. "GLD.US"
  display: string;  // Human-friendly name
}

/**
 * All EODHD tickers tracked by Exodus.
 */
export const EODHD_TICKERS: EodhdTickerConfig[] = [
  { ticker: 'GLD.US',  display: 'Gold (GLD)'             },
  { ticker: 'SLV.US',  display: 'Silver (SLV)'           },
  { ticker: 'QQQ.US',  display: 'Nasdaq-100 (QQQ)'       },
  { ticker: 'UUP.US',  display: 'US Dollar (UUP)'        },
  { ticker: 'COPX.US', display: 'Copper Miners (COPX)'   },
  { ticker: 'SPY.US',  display: 'S&P 500 (SPY)'          },
];

const EODHD_BASE_URL = 'https://eodhd.com/api/eod';

/**
 * Fetch end-of-day price data for a single ticker from EODHD.
 *
 * @param ticker    EODHD ticker with exchange suffix (e.g. "GLD.US")
 * @param startDate Optional ISO date string (YYYY-MM-DD). Defaults to 2000-01-01.
 * @returns Array of PriceRow objects sorted by date ascending.
 */
export async function fetchEodhdPrices(
  ticker: string,
  startDate?: string,
): Promise<PriceRow[]> {
  const apiKey = process.env.EODHD_API_KEY;
  if (!apiKey) {
    throw new Error('EODHD_API_KEY environment variable is not set');
  }

  const from = startDate ?? '2000-01-01';

  const url = `${EODHD_BASE_URL}/${ticker}?from=${from}&fmt=json&api_token=${apiKey}`;

  const response = await fetch(url);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `EODHD API error for ${ticker}: ${response.status} ${response.statusText} — ${text}`,
    );
  }

  const json = (await response.json()) as Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    adjusted_close: number;
  }>;

  return json.map((row) => ({
    date: row.date,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume,
    adjusted_close: row.adjusted_close,
  }));
}
