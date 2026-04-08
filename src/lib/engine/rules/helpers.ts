import type { MarketData, PriceRow, FredRow } from '../../types';

// ===== TICKER RESOLUTION =====

const TICKER_MAP: Record<string, string> = {
  GLD: 'GLD.US', SLV: 'SLV.US', QQQ: 'QQQ.US',
  SPY: 'SPY.US', UUP: 'UUP.US', COPX: 'COPX.US',
};

/** Resolve a short ticker name (GLD) to the actual key in data.prices (GLD.US) */
function resolveTicker(data: MarketData, ticker: string): string {
  if (data.prices[ticker]) return ticker;
  const mapped = TICKER_MAP[ticker];
  if (mapped && data.prices[mapped]) return mapped;
  if (data.prices[ticker + '.US']) return ticker + '.US';
  return ticker;
}

// ===== DATE / INDEX HELPERS =====

/** Find index of given date (or latest date <= given date) in a ticker's price array */
export function getDateIndex(data: MarketData, ticker: string, date: string): number | null {
  const resolved = resolveTicker(data, ticker);
  const prices = data.prices[resolved];
  if (!prices || prices.length === 0) return null;

  // Binary search for the date or the closest earlier date
  let lo = 0;
  let hi = prices.length - 1;

  if (prices[lo].date > date) return null; // date is before all data
  if (prices[hi].date <= date) return hi;

  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (prices[mid].date <= date) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}

/** Get the date string N trading days before the given date for a ticker */
export function tradingDaysBefore(data: MarketData, ticker: string, date: string, n: number): string | null {
  const resolved = resolveTicker(data, ticker);
  const idx = getDateIndex(data, ticker, date);
  if (idx === null || idx < n) return null;
  return data.prices[resolved][idx - n].date;
}

// ===== PRICE HELPERS =====

/** Get closing price on or before a given date */
export function getPrice(data: MarketData, ticker: string, date: string): number | null {
  const resolved = resolveTicker(data, ticker);
  const idx = getDateIndex(data, ticker, date);
  if (idx === null) return null;
  return data.prices[resolved][idx].adjusted_close;
}

/** Get closing price N trading days before a given date */
export function getPriceN(data: MarketData, ticker: string, date: string, daysBack: number): number | null {
  const resolved = resolveTicker(data, ticker);
  const idx = getDateIndex(data, ticker, date);
  if (idx === null || idx < daysBack) return null;
  return data.prices[resolved][idx - daysBack].adjusted_close;
}

/** Get high price on or before a given date */
export function getHigh(data: MarketData, ticker: string, date: string): number | null {
  const resolved = resolveTicker(data, ticker);
  const idx = getDateIndex(data, ticker, date);
  if (idx === null) return null;
  return data.prices[resolved][idx].high;
}

// ===== FRED HELPERS =====

/** Get the most recent FRED value on or before a given date */
export function getFredValue(data: MarketData, seriesId: string, date: string): number | null {
  const rows = data.fred[seriesId];
  if (!rows || rows.length === 0) return null;

  // Binary search for latest row with date <= given date
  let lo = 0;
  let hi = rows.length - 1;

  if (rows[lo].date > date) return null;
  if (rows[hi].date <= date) return rows[hi].value;

  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (rows[mid].date <= date) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return rows[lo].value;
}

/** Get FRED value from approximately N months ago */
export function getFredValueNMonthsAgo(data: MarketData, seriesId: string, date: string, months: number): number | null {
  const d = new Date(date);
  d.setMonth(d.getMonth() - months);
  const pastDate = d.toISOString().slice(0, 10);
  return getFredValue(data, seriesId, pastDate);
}

/** Get FRED row index on or before a given date */
export function getFredIndex(data: MarketData, seriesId: string, date: string): number | null {
  const rows = data.fred[seriesId];
  if (!rows || rows.length === 0) return null;

  let lo = 0;
  let hi = rows.length - 1;

  if (rows[lo].date > date) return null;
  if (rows[hi].date <= date) return hi;

  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (rows[mid].date <= date) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}

/** Get the N most recent FRED rows on or before a given date */
export function getRecentFredRows(data: MarketData, seriesId: string, date: string, count: number): FredRow[] | null {
  const idx = getFredIndex(data, seriesId, date);
  if (idx === null || idx < count - 1) return null;
  return data.fred[seriesId].slice(idx - count + 1, idx + 1);
}

// ===== TECHNICAL INDICATORS =====

/** Simple Moving Average over `period` trading days */
export function getSMA(data: MarketData, ticker: string, date: string, period: number): number | null {
  const resolved = resolveTicker(data, ticker);
  const idx = getDateIndex(data, ticker, date);
  if (idx === null || idx < period - 1) return null;
  const prices = data.prices[resolved];
  let sum = 0;
  for (let i = idx - period + 1; i <= idx; i++) {
    sum += prices[i].adjusted_close;
  }
  return sum / period;
}

/** RSI over `period` trading days */
export function getRSI(data: MarketData, ticker: string, date: string, period: number): number | null {
  const resolved = resolveTicker(data, ticker);
  const idx = getDateIndex(data, ticker, date);
  if (idx === null || idx < period) return null;
  const prices = data.prices[resolved];

  let avgGain = 0;
  let avgLoss = 0;
  // Initial average
  for (let i = idx - period + 1; i <= idx; i++) {
    const change = prices[i].adjusted_close - prices[i - 1].adjusted_close;
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** Bollinger Bands: returns {upper, middle, lower} */
export function getBollingerBands(
  data: MarketData,
  ticker: string,
  date: string,
  period: number,
  stddev: number
): { upper: number; middle: number; lower: number } | null {
  const resolved = resolveTicker(data, ticker);
  const idx = getDateIndex(data, ticker, date);
  if (idx === null || idx < period - 1) return null;
  const prices = data.prices[resolved];

  let sum = 0;
  for (let i = idx - period + 1; i <= idx; i++) {
    sum += prices[i].adjusted_close;
  }
  const mean = sum / period;

  let sqSum = 0;
  for (let i = idx - period + 1; i <= idx; i++) {
    const diff = prices[i].adjusted_close - mean;
    sqSum += diff * diff;
  }
  const std = Math.sqrt(sqSum / period);

  return {
    upper: mean + stddev * std,
    middle: mean,
    lower: mean - stddev * std,
  };
}

// ===== RETURN / VOLATILITY HELPERS =====

/** Return over N trading days (decimal, e.g. 0.10 = 10%) */
export function getReturn(data: MarketData, ticker: string, date: string, days: number): number | null {
  const current = getPrice(data, ticker, date);
  const past = getPriceN(data, ticker, date, days);
  if (current === null || past === null || past === 0) return null;
  return (current - past) / past;
}

/** Return over N months (approximate: 21 trading days per month) */
export function getReturnMonths(data: MarketData, ticker: string, date: string, months: number): number | null {
  return getReturn(data, ticker, date, months * 21);
}

/** Annualized realized volatility over N trading days */
export function getRealizedVol(data: MarketData, ticker: string, date: string, days: number): number | null {
  const resolved = resolveTicker(data, ticker);
  const idx = getDateIndex(data, ticker, date);
  if (idx === null || idx < days) return null;
  const prices = data.prices[resolved];

  const returns: number[] = [];
  for (let i = idx - days + 1; i <= idx; i++) {
    const prev = prices[i - 1].adjusted_close;
    if (prev === 0) return null;
    returns.push(Math.log(prices[i].adjusted_close / prev));
  }

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance * 252) * 100; // annualized, in percent
}

/** Max drawdown from peak over lookback period (returns positive number, e.g. 0.15 = 15%) */
export function getDrawdownFromHigh(data: MarketData, ticker: string, date: string, lookbackDays: number): number | null {
  const resolved = resolveTicker(data, ticker);
  const idx = getDateIndex(data, ticker, date);
  if (idx === null || idx < lookbackDays) return null;
  const prices = data.prices[resolved];

  let peak = -Infinity;
  for (let i = idx - lookbackDays; i <= idx; i++) {
    if (prices[i].adjusted_close > peak) peak = prices[i].adjusted_close;
  }

  const current = prices[idx].adjusted_close;
  if (peak <= 0) return null;
  return (peak - current) / peak;
}

/** Rolling correlation between two tickers over N trading days */
export function getCorrelation(data: MarketData, ticker1: string, ticker2: string, date: string, days: number): number | null {
  const resolved1 = resolveTicker(data, ticker1);
  const resolved2 = resolveTicker(data, ticker2);
  const idx1 = getDateIndex(data, ticker1, date);
  const idx2 = getDateIndex(data, ticker2, date);
  if (idx1 === null || idx2 === null || idx1 < days || idx2 < days) return null;

  const p1 = data.prices[resolved1];
  const p2 = data.prices[resolved2];

  // Build daily return arrays aligned by date
  const returns1: number[] = [];
  const returns2: number[] = [];

  for (let i = idx1 - days + 1; i <= idx1; i++) {
    const d = p1[i].date;
    const i2 = getDateIndex(data, ticker2, d);
    if (i2 === null || i2 < 1) continue;
    const r1 = Math.log(p1[i].adjusted_close / p1[i - 1].adjusted_close);
    const r2 = Math.log(p2[i2].adjusted_close / p2[i2 - 1].adjusted_close);
    returns1.push(r1);
    returns2.push(r2);
  }

  if (returns1.length < days * 0.8) return null; // not enough overlap

  const n = returns1.length;
  const mean1 = returns1.reduce((a, b) => a + b, 0) / n;
  const mean2 = returns2.reduce((a, b) => a + b, 0) / n;

  let cov = 0;
  let var1 = 0;
  let var2 = 0;
  for (let i = 0; i < n; i++) {
    const d1 = returns1[i] - mean1;
    const d2 = returns2[i] - mean2;
    cov += d1 * d2;
    var1 += d1 * d1;
    var2 += d2 * d2;
  }

  if (var1 === 0 || var2 === 0) return null;
  return cov / Math.sqrt(var1 * var2);
}

// ===== CALENDAR HELPERS =====

/** Extract month number (1-12) from a date string YYYY-MM-DD */
export function monthOf(date: string): number {
  return parseInt(date.slice(5, 7), 10);
}

/** Extract day of month from a date string */
export function dayOf(date: string): number {
  return parseInt(date.slice(8, 10), 10);
}

/** Extract year from a date string */
export function yearOf(date: string): number {
  return parseInt(date.slice(0, 4), 10);
}

/**
 * Check presidential cycle year.
 * yearInCycle: 1 = inauguration year, 2 = midterm, 3 = pre-election, 4 = election year
 * US elections happen in years divisible by 4.
 */
export function isPresidentialCycleYear(date: string, yearInCycle: number): boolean {
  const year = yearOf(date);
  // Election years: 2000, 2004, 2008, ...
  // yearInCycle 4 = election year, 1 = year after election, 2 = midterm, 3 = pre-election
  const mod = ((year % 4) + 4) % 4; // 0 = election year
  // map: election year(0) -> cycle 4, 1 -> cycle 1, 2 -> cycle 2, 3 -> cycle 3
  const cycle = mod === 0 ? 4 : mod;
  return cycle === yearInCycle;
}

/** Check if date is in the last N trading days of a quarter */
export function isLastDaysOfQuarter(date: string, days: number): boolean {
  const month = monthOf(date);
  const day = dayOf(date);
  // Quarter ends: March 31, June 30, September 30, December 31
  const isQuarterEndMonth = month === 3 || month === 6 || month === 9 || month === 12;
  if (!isQuarterEndMonth) return false;
  // Approximate: last 5 calendar days of the month covers ~5 trading days
  const daysInMonth = new Date(yearOf(date), month, 0).getDate();
  return day > daysInMonth - days - 2; // small buffer for weekends
}

// ===== FRED DERIVED HELPERS =====

/** Compute YoY change for a monthly FRED series */
export function getFredYoY(data: MarketData, seriesId: string, date: string): number | null {
  const current = getFredValue(data, seriesId, date);
  const past = getFredValueNMonthsAgo(data, seriesId, date, 12);
  if (current === null || past === null || past === 0) return null;
  return (current - past) / past;
}

/** Check if a FRED series has been rising for N consecutive months */
export function isFredRisingForMonths(data: MarketData, seriesId: string, date: string, months: number): boolean {
  const rows = getRecentFredRows(data, seriesId, date, months + 1);
  if (!rows || rows.length < months + 1) return false;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].value <= rows[i - 1].value) return false;
  }
  return true;
}

/** Check if a FRED series has been falling for N consecutive months */
export function isFredFallingForMonths(data: MarketData, seriesId: string, date: string, months: number): boolean {
  const rows = getRecentFredRows(data, seriesId, date, months + 1);
  if (!rows || rows.length < months + 1) return false;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].value >= rows[i - 1].value) return false;
  }
  return true;
}

/** Get the minimum value of a FRED series over the past N months */
export function getFredMinOverMonths(data: MarketData, seriesId: string, date: string, months: number): number | null {
  const rows = getRecentFredRows(data, seriesId, date, months);
  if (!rows || rows.length === 0) return null;
  return Math.min(...rows.map(r => r.value));
}

/** Get the maximum value of a FRED series over the past N months */
export function getFredMaxOverMonths(data: MarketData, seriesId: string, date: string, months: number): number | null {
  const rows = getRecentFredRows(data, seriesId, date, months);
  if (!rows || rows.length === 0) return null;
  return Math.max(...rows.map(r => r.value));
}

/** Get the 4-week average for a weekly FRED series (e.g. ICSA) */
export function getFred4WeekAvg(data: MarketData, seriesId: string, date: string): number | null {
  const rows = getRecentFredRows(data, seriesId, date, 4);
  if (!rows || rows.length < 4) return null;
  return rows.reduce((sum, r) => sum + r.value, 0) / 4;
}

/** Get the minimum of 4-week avg over last N weeks */
export function getFred4WeekAvgMinOverWeeks(data: MarketData, seriesId: string, date: string, lookbackWeeks: number): number | null {
  const rows = getRecentFredRows(data, seriesId, date, lookbackWeeks);
  if (!rows || rows.length < 4) return null;
  let minAvg = Infinity;
  for (let i = 3; i < rows.length; i++) {
    const avg = (rows[i].value + rows[i - 1].value + rows[i - 2].value + rows[i - 3].value) / 4;
    if (avg < minAvg) minAvg = avg;
  }
  return minAvg === Infinity ? null : minAvg;
}

/** Get the maximum of 4-week avg over last N weeks */
export function getFred4WeekAvgMaxOverWeeks(data: MarketData, seriesId: string, date: string, lookbackWeeks: number): number | null {
  const rows = getRecentFredRows(data, seriesId, date, lookbackWeeks);
  if (!rows || rows.length < 4) return null;
  let maxAvg = -Infinity;
  for (let i = 3; i < rows.length; i++) {
    const avg = (rows[i].value + rows[i - 1].value + rows[i - 2].value + rows[i - 3].value) / 4;
    if (avg > maxAvg) maxAvg = avg;
  }
  return maxAvg === -Infinity ? null : maxAvg;
}

/** FRED change over N months (absolute difference) */
export function getFredChangeOverMonths(data: MarketData, seriesId: string, date: string, months: number): number | null {
  const current = getFredValue(data, seriesId, date);
  const past = getFredValueNMonthsAgo(data, seriesId, date, months);
  if (current === null || past === null) return null;
  return current - past;
}

/** Check if a FRED value has been above a threshold for N consecutive months */
export function isFredAboveForMonths(data: MarketData, seriesId: string, date: string, threshold: number, months: number): boolean {
  const rows = getRecentFredRows(data, seriesId, date, months);
  if (!rows || rows.length < months) return false;
  return rows.every(r => r.value > threshold);
}

/** Check if a FRED value has been below a threshold for N consecutive months */
export function isFredBelowForMonths(data: MarketData, seriesId: string, date: string, threshold: number, months: number): boolean {
  const rows = getRecentFredRows(data, seriesId, date, months);
  if (!rows || rows.length < months) return false;
  return rows.every(r => r.value < threshold);
}
