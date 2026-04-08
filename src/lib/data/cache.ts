/**
 * Data caching layer — fetches from external APIs, stores in Postgres,
 * and exposes helpers that the backtesting engine and UI can use.
 */

import { sql } from '@vercel/postgres';
import { getLatestDate, upsertDataMetadata } from '@/lib/db';
import { fetchFredSeries, FRED_SERIES } from '@/lib/data/fred';
import { fetchEodhdPrices, EODHD_TICKERS } from '@/lib/data/eodhd';
import type {
  PriceRow,
  FredRow,
  MarketData,
  DataSourceHealth,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// refreshAllData — incremental fetch for every series
// ---------------------------------------------------------------------------

export async function refreshAllData(): Promise<{
  success: boolean;
  errors: string[];
}> {
  const errors: string[] = [];

  // --- FRED series ---
  for (const series of FRED_SERIES) {
    try {
      const lastDate = await getLatestDate('fred', series.id);

      // If we already have data, start one day after the last stored date
      // to avoid re-inserting the last row (off-by-one fix).
      let startDate: string | undefined;
      if (lastDate) {
        startDate = addDays(lastDate, 1);
      } else {
        startDate = '2000-01-01';
      }

      const rows = await fetchFredSeries(series.id, startDate);
      if (rows.length === 0) continue;

      // Bulk upsert into fred_data
      for (const row of rows) {
        await sql`
          INSERT INTO fred_data (series_id, date, value)
          VALUES (${series.id}, ${row.date}::date, ${row.value})
          ON CONFLICT (series_id, date) DO UPDATE SET value = EXCLUDED.value
        `;
      }

      // Count total rows for this series
      const countResult = await sql`
        SELECT COUNT(*)::int AS cnt FROM fred_data WHERE series_id = ${series.id}
      `;
      const totalRows = countResult.rows[0].cnt as number;

      // Find the actual latest date stored
      const maxResult = await sql`
        SELECT MAX(date) AS max_date FROM fred_data WHERE series_id = ${series.id}
      `;
      const maxDate = maxResult.rows[0].max_date;
      const maxDateStr =
        typeof maxDate === 'string'
          ? maxDate
          : (maxDate as Date).toISOString().slice(0, 10);

      await upsertDataMetadata('fred', series.id, maxDateStr, totalRows);
    } catch (err) {
      const msg = `FRED ${series.id}: ${err instanceof Error ? err.message : String(err)}`;
      console.error(msg);
      errors.push(msg);
    }
  }

  // --- EODHD tickers ---
  for (const tickerCfg of EODHD_TICKERS) {
    try {
      const lastDate = await getLatestDate('eodhd', tickerCfg.ticker);

      let startDate: string | undefined;
      if (lastDate) {
        startDate = addDays(lastDate, 1);
      } else {
        startDate = '2000-01-01';
      }

      const rows = await fetchEodhdPrices(tickerCfg.ticker, startDate);
      if (rows.length === 0) continue;

      for (const row of rows) {
        await sql`
          INSERT INTO price_data (ticker, date, open, high, low, close, volume, adjusted_close)
          VALUES (
            ${tickerCfg.ticker},
            ${row.date}::date,
            ${row.open},
            ${row.high},
            ${row.low},
            ${row.close},
            ${row.volume},
            ${row.adjusted_close}
          )
          ON CONFLICT (ticker, date) DO UPDATE SET
            open = EXCLUDED.open,
            high = EXCLUDED.high,
            low = EXCLUDED.low,
            close = EXCLUDED.close,
            volume = EXCLUDED.volume,
            adjusted_close = EXCLUDED.adjusted_close
        `;
      }

      const countResult = await sql`
        SELECT COUNT(*)::int AS cnt FROM price_data WHERE ticker = ${tickerCfg.ticker}
      `;
      const totalRows = countResult.rows[0].cnt as number;

      const maxResult = await sql`
        SELECT MAX(date) AS max_date FROM price_data WHERE ticker = ${tickerCfg.ticker}
      `;
      const maxDate = maxResult.rows[0].max_date;
      const maxDateStr =
        typeof maxDate === 'string'
          ? maxDate
          : (maxDate as Date).toISOString().slice(0, 10);

      await upsertDataMetadata('eodhd', tickerCfg.ticker, maxDateStr, totalRows);
    } catch (err) {
      const msg = `EODHD ${tickerCfg.ticker}: ${err instanceof Error ? err.message : String(err)}`;
      console.error(msg);
      errors.push(msg);
    }
  }

  return { success: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// getDataHealth — freshness check for every tracked source
// ---------------------------------------------------------------------------

export async function getDataHealth(): Promise<DataSourceHealth[]> {
  const results: DataSourceHealth[] = [];
  const now = Date.now();

  // FRED
  const fredMeta = await sql`
    SELECT series_id, last_updated, last_date, row_count
    FROM data_metadata WHERE source = 'fred'
  `;

  const fredStaleCutoff = 3 * 24 * 60 * 60 * 1000; // 3 days
  const fredLaggedCutoff = 1 * 24 * 60 * 60 * 1000; // 1 day

  let fredWorst = 'ok' as string;
  let fredLastUpdated = '';

  for (const row of fredMeta.rows) {
    const updatedAt = new Date(row.last_updated).getTime();
    const age = now - updatedAt;
    if (age > fredStaleCutoff && fredWorst !== 'error') fredWorst = 'stale';
    else if (age > fredLaggedCutoff && fredWorst === 'ok') fredWorst = 'lagged';
    if (!fredLastUpdated || row.last_updated > fredLastUpdated) {
      fredLastUpdated = row.last_updated;
    }
  }

  results.push({
    source: 'FRED',
    status: fredMeta.rows.length === 0 ? 'error' as const : fredWorst as 'ok' | 'lagged' | 'stale',
    last_updated: fredLastUpdated || 'never',
    series_count: fredMeta.rows.length,
    detail:
      fredMeta.rows.length === 0
        ? 'No FRED data in database'
        : `${fredMeta.rows.length}/${FRED_SERIES.length} series cached`,
  });

  // EODHD
  const eodhdMeta = await sql`
    SELECT series_id, last_updated, last_date, row_count
    FROM data_metadata WHERE source = 'eodhd'
  `;

  let eodhdWorst = 'ok' as string;
  let eodhdLastUpdated = '';

  for (const row of eodhdMeta.rows) {
    const updatedAt = new Date(row.last_updated).getTime();
    const age = now - updatedAt;
    if (age > fredStaleCutoff && eodhdWorst !== 'error') eodhdWorst = 'stale';
    else if (age > fredLaggedCutoff && eodhdWorst === 'ok') eodhdWorst = 'lagged';
    if (!eodhdLastUpdated || row.last_updated > eodhdLastUpdated) {
      eodhdLastUpdated = row.last_updated;
    }
  }

  results.push({
    source: 'EODHD',
    status: eodhdMeta.rows.length === 0 ? 'error' as const : eodhdWorst as 'ok' | 'lagged' | 'stale',
    last_updated: eodhdLastUpdated || 'never',
    series_count: eodhdMeta.rows.length,
    detail:
      eodhdMeta.rows.length === 0
        ? 'No EODHD data in database'
        : `${eodhdMeta.rows.length}/${EODHD_TICKERS.length} tickers cached`,
  });

  return results;
}

// ---------------------------------------------------------------------------
// Data accessors — read cached data from Postgres
// ---------------------------------------------------------------------------

/**
 * Get all cached daily price data for a ticker, ordered by date ascending.
 */
export async function getPriceData(ticker: string): Promise<PriceRow[]> {
  const result = await sql`
    SELECT date, open, high, low, close, volume, adjusted_close
    FROM price_data
    WHERE ticker = ${ticker}
    ORDER BY date ASC
  `;

  return result.rows.map((r) => ({
    date: typeof r.date === 'string' ? r.date : (r.date as Date).toISOString().slice(0, 10),
    open: r.open as number,
    high: r.high as number,
    low: r.low as number,
    close: r.close as number,
    volume: r.volume as number,
    adjusted_close: r.adjusted_close as number,
  }));
}

/**
 * Get all cached FRED data for a series, ordered by date ascending.
 */
export async function getFredData(seriesId: string): Promise<FredRow[]> {
  const result = await sql`
    SELECT date, value
    FROM fred_data
    WHERE series_id = ${seriesId}
    ORDER BY date ASC
  `;

  return result.rows.map((r) => ({
    date: typeof r.date === 'string' ? r.date : (r.date as Date).toISOString().slice(0, 10),
    value: r.value as number,
  }));
}

// ---------------------------------------------------------------------------
// buildMarketData — loads everything into memory for backtesting
// ---------------------------------------------------------------------------

/**
 * Build the full MarketData object by loading all cached price and FRED data.
 * The `computed` field is left empty — the engine populates it with derived
 * indicators (SMA, RSI, etc.) at backtest time.
 */
export async function buildMarketData(): Promise<MarketData> {
  const prices: Record<string, PriceRow[]> = {};
  const fred: Record<string, FredRow[]> = {};

  // Load all EODHD tickers in parallel
  const pricePromises = EODHD_TICKERS.map(async (t) => {
    prices[t.ticker] = await getPriceData(t.ticker);
  });

  // Load all FRED series in parallel
  const fredPromises = FRED_SERIES.map(async (s) => {
    fred[s.id] = await getFredData(s.id);
  });

  await Promise.all([...pricePromises, ...fredPromises]);

  return {
    prices,
    fred,
    computed: {},
  };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Add `n` days to an ISO date string and return the new date string.
 */
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
