// ===== CORE BACKTESTING ENGINE =====
// Implements the Exodus execution model:
//   - Signal on day T from close price
//   - Execute at day T+1 close price (1-day delay)
//   - 10 trading day minimum hold
//   - 10 bps (0.1%) cost per trade

import type { Asset, RuleDefinition, MarketData, TradeRecord } from '@/lib/types';

// ===== Types =====

export interface BacktestResult {
  trades: TradeRecord[];
  equity_curve: { date: string; value: number }[];
  cagr: number;
  sharpe: number;
  max_drawdown: number;
  profit_factor: number;
  total_trades: number;
  trades_per_year: number;
  win_rate: number;
  avg_winner: number;
  avg_loser: number;
  final_signal: Asset;
}

// ===== Helpers =====

const TRADABLE_ASSETS: Asset[] = ['GLD', 'SLV', 'QQQ'];
const TRANSACTION_COST_BPS = 10; // 10 basis points = 0.1%
const MIN_HOLD_DAYS = 10; // trading days

// Map short asset names to EODHD ticker format
const TICKER_MAP: Record<string, string> = {
  GLD: 'GLD.US', SLV: 'SLV.US', QQQ: 'QQQ.US',
  SPY: 'SPY.US', UUP: 'UUP.US', COPX: 'COPX.US',
};

function resolveTicker(data: MarketData, ticker: string): string {
  // Try exact match first, then mapped name
  if (data.prices[ticker]) return ticker;
  const mapped = TICKER_MAP[ticker];
  if (mapped && data.prices[mapped]) return mapped;
  // Try with .US suffix
  if (data.prices[ticker + '.US']) return ticker + '.US';
  return ticker;
}

// Cache for date→index maps per ticker (avoids repeated binary searches)
const dateIndexCache = new WeakMap<object, Map<string, Map<string, number>>>();

function getDateIndexMap(data: MarketData, ticker: string): Map<string, number> {
  let tickerMaps = dateIndexCache.get(data);
  if (!tickerMaps) {
    tickerMaps = new Map();
    dateIndexCache.set(data, tickerMaps);
  }
  let map = tickerMaps.get(ticker);
  if (!map) {
    map = new Map();
    const rows = data.prices[ticker];
    if (rows) {
      for (let i = 0; i < rows.length; i++) {
        map.set(rows[i].date, i);
      }
    }
    tickerMaps.set(ticker, map);
  }
  return map;
}

/**
 * Get all unique trading dates across price data within a date range.
 * Returns sorted array of date strings.
 */
function getTradingDates(data: MarketData, startDate: string, endDate: string): string[] {
  const refTicker = resolveTicker(data, 'SPY') || resolveTicker(data, 'GLD') || Object.keys(data.prices)[0];
  if (!refTicker || !data.prices[refTicker]) return [];

  return data.prices[refTicker]
    .map((row) => row.date)
    .filter((d) => d >= startDate && d <= endDate)
    .sort();
}

/**
 * Get the close price for a ticker on a given date.
 * Uses O(1) date→index map lookup.
 */
function getPrice(data: MarketData, ticker: string, date: string): number | null {
  const resolved = resolveTicker(data, ticker);
  const rows = data.prices[resolved];
  if (!rows || rows.length === 0) return null;

  const indexMap = getDateIndexMap(data, resolved);
  const idx = indexMap.get(date);
  if (idx !== undefined) {
    return rows[idx].adjusted_close || rows[idx].close;
  }

  // Fallback: binary search for nearest date <= requested
  let lo = 0;
  let hi = rows.length - 1;
  if (rows[lo].date > date) return null;
  if (rows[hi].date <= date) return rows[hi].adjusted_close || rows[hi].close;

  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (rows[mid].date <= date) lo = mid;
    else hi = mid - 1;
  }
  return rows[lo].adjusted_close || rows[lo].close;
}

/**
 * Get the daily return for an asset. Cash always returns 0.
 */
function getAssetReturn(data: MarketData, asset: Asset, fromDate: string, toDate: string): number {
  if (asset === 'Cash') return 0;

  const startPrice = getPrice(data, asset, fromDate);
  const endPrice = getPrice(data, asset, toDate);

  if (!startPrice || !endPrice || startPrice === 0) return 0;
  return (endPrice - startPrice) / startPrice;
}

/**
 * Evaluate all rules for a given date and determine the signal based on rule logic.
 */
function evaluateSignal(
  rules: RuleDefinition[],
  ruleLogic: 'majority' | 'all' | 'any',
  data: MarketData,
  date: string
): Asset {
  if (rules.length === 0) return 'Cash';

  // Evaluate each rule
  const results: { rule: RuleDefinition; active: boolean }[] = rules.map((rule) => {
    let active = false;
    try {
      active = rule.evaluate(data, date);
    } catch {
      active = false;
    }
    return { rule, active };
  });

  const activeRules = results.filter((r) => r.active);

  if (ruleLogic === 'all') {
    // All rules must be active for a non-Cash signal
    if (activeRules.length < rules.length) return 'Cash';
    // All active: use majority vote among their assets
    return majorityVote(activeRules.map((r) => r.rule.asset));
  }

  if (ruleLogic === 'any') {
    // Any rule being true triggers its asset
    if (activeRules.length === 0) return 'Cash';
    return majorityVote(activeRules.map((r) => r.rule.asset));
  }

  // 'majority': >50% of rules must be active
  if (activeRules.length <= rules.length / 2) return 'Cash';
  return majorityVote(activeRules.map((r) => r.rule.asset));
}

/**
 * Majority vote among a list of asset votes.
 * Returns the asset with the most votes. Ties broken by priority: GLD > QQQ > SLV > Cash.
 */
function majorityVote(votes: Asset[]): Asset {
  if (votes.length === 0) return 'Cash';

  const counts: Record<Asset, number> = { GLD: 0, SLV: 0, QQQ: 0, Cash: 0 };
  for (const v of votes) {
    counts[v]++;
  }

  const priority: Asset[] = ['GLD', 'QQQ', 'SLV', 'Cash'];
  let best: Asset = 'Cash';
  let bestCount = 0;
  for (const asset of priority) {
    if (counts[asset] > bestCount) {
      bestCount = counts[asset];
      best = asset;
    }
  }
  return best;
}

// ===== Main Backtest Function =====

export function backtestStrategy(
  rules: RuleDefinition[],
  ruleLogic: 'majority' | 'all' | 'any',
  data: MarketData,
  startDate: string,
  endDate: string
): BacktestResult {
  const dates = getTradingDates(data, startDate, endDate);

  if (dates.length < 2) {
    return emptyResult();
  }

  // State
  let equity = 1.0;
  let currentHolding: Asset = 'Cash';
  let holdingSince = 0; // index into dates array
  let entryPrice: Record<string, number> = {}; // ticker -> entry price for current trade

  const equityCurve: { date: string; value: number }[] = [];
  const trades: TradeRecord[] = [];
  let pendingSignal: { signal: Asset; signalDay: number } | null = null;
  let tradeStartDate = dates[0];
  let tradeStartEquity = equity;

  // Track daily equity value
  let lastTradeEquity = equity; // equity at start of current holding period
  let lastTradeDate = dates[0]; // date we entered the current holding

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];

    // Update equity based on current holding's daily return
    if (i > 0 && currentHolding !== 'Cash') {
      const dayReturn = getAssetReturn(data, currentHolding, dates[i - 1], date);
      equity *= (1 + dayReturn);
    }

    // Execute pending trade at today's close (T+1 execution)
    if (pendingSignal && pendingSignal.signalDay === i - 1) {
      const newAsset: Asset = pendingSignal.signal;

      // Record completed trade
      if (i > 0) {
        const tradeDays = i - holdingSince;
        const tradeReturn = tradeStartEquity > 0
          ? (equity - tradeStartEquity) / tradeStartEquity
          : 0;

        // Compute good_call: did this holding outperform the best alternative?
        const bestAltReturn = getBestAlternativeReturn(data, currentHolding, tradeStartDate, date);
        const goodCall = tradeReturn >= bestAltReturn - 0.01; // within 1% tolerance

        if (holdingSince < i) {
          trades.push({
            from_date: tradeStartDate,
            to_date: date,
            holding: currentHolding,
            days: tradeDays,
            return_pct: tradeReturn,
            good_call: goodCall,
          });
        }
      }

      // Apply transaction cost
      equity *= (1 - TRANSACTION_COST_BPS / 10000);

      // Switch holding
      currentHolding = newAsset;
      holdingSince = i;
      tradeStartDate = date;
      tradeStartEquity = equity;
      pendingSignal = null;
    }

    // Generate signal for today (evaluate at close)
    const signal = evaluateSignal(rules, ruleLogic, data, date);
    const daysSinceEntry = i - holdingSince;

    if (signal !== currentHolding && daysSinceEntry >= MIN_HOLD_DAYS) {
      // Queue trade for T+1 execution
      pendingSignal = { signal, signalDay: i };
    }

    equityCurve.push({ date, value: equity });
  }

  // Close final trade
  const lastDate = dates[dates.length - 1];
  const finalTradeDays = dates.length - 1 - holdingSince;
  if (finalTradeDays > 0) {
    const tradeReturn = tradeStartEquity > 0
      ? (equity - tradeStartEquity) / tradeStartEquity
      : 0;
    const bestAltReturn = getBestAlternativeReturn(data, currentHolding, tradeStartDate, lastDate);
    const goodCall = tradeReturn >= bestAltReturn - 0.01;

    trades.push({
      from_date: tradeStartDate,
      to_date: lastDate,
      holding: currentHolding,
      days: finalTradeDays,
      return_pct: tradeReturn,
      good_call: goodCall,
    });
  }

  // Compute final signal (last date's evaluation)
  const finalSignal = evaluateSignal(rules, ruleLogic, data, lastDate);

  // Compute metrics
  const totalYears = dates.length / 252; // approximate trading days per year
  const cagr = totalYears > 0 ? Math.pow(equity, 1 / totalYears) - 1 : 0;
  const sharpe = computeSharpe(equityCurve);
  const maxDrawdown = computeMaxDrawdown(equityCurve);
  const { profitFactor, winRate, avgWinner, avgLoser } = computeTradeStats(trades);

  return {
    trades,
    equity_curve: equityCurve,
    cagr,
    sharpe,
    max_drawdown: maxDrawdown,
    profit_factor: profitFactor,
    total_trades: trades.length,
    trades_per_year: totalYears > 0 ? trades.length / totalYears : 0,
    win_rate: winRate,
    avg_winner: avgWinner,
    avg_loser: avgLoser,
    final_signal: finalSignal,
  };
}

// ===== Metric Computation =====

function getBestAlternativeReturn(
  data: MarketData,
  currentAsset: Asset,
  fromDate: string,
  toDate: string
): number {
  const alternatives: Asset[] = ['GLD', 'SLV', 'QQQ', 'Cash'].filter(
    (a) => a !== currentAsset
  ) as Asset[];

  let best = -Infinity;
  for (const alt of alternatives) {
    const ret = getAssetReturn(data, alt, fromDate, toDate);
    if (ret > best) best = ret;
  }
  return best === -Infinity ? 0 : best;
}

function computeSharpe(equityCurve: { date: string; value: number }[]): number {
  if (equityCurve.length < 2) return 0;

  const dailyReturns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1].value;
    if (prev === 0) continue;
    dailyReturns.push((equityCurve[i].value - prev) / prev);
  }

  if (dailyReturns.length < 2) return 0;

  const mean = dailyReturns.reduce((s, v) => s + v, 0) / dailyReturns.length;
  const variance =
    dailyReturns.reduce((s, v) => s + (v - mean) ** 2, 0) / (dailyReturns.length - 1);
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return mean > 0 ? 10 : 0;

  // Annualized Sharpe (assuming 0% risk-free rate, 252 trading days)
  return (mean / stdDev) * Math.sqrt(252);
}

function computeMaxDrawdown(equityCurve: { date: string; value: number }[]): number {
  if (equityCurve.length === 0) return 0;

  let peak = equityCurve[0].value;
  let maxDD = 0;

  for (const point of equityCurve) {
    if (point.value > peak) peak = point.value;
    const dd = (point.value - peak) / peak;
    if (dd < maxDD) maxDD = dd;
  }

  return maxDD; // Negative number, e.g., -0.15 = -15%
}

function computeTradeStats(trades: TradeRecord[]): {
  profitFactor: number;
  winRate: number;
  avgWinner: number;
  avgLoser: number;
} {
  if (trades.length === 0) {
    return { profitFactor: 0, winRate: 0, avgWinner: 0, avgLoser: 0 };
  }

  const winners = trades.filter((t) => t.return_pct > 0);
  const losers = trades.filter((t) => t.return_pct < 0);

  const totalWins = winners.reduce((s, t) => s + t.return_pct, 0);
  const totalLosses = Math.abs(losers.reduce((s, t) => s + t.return_pct, 0));

  const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? 99.99 : 0;
  const winRate = trades.length > 0 ? winners.length / trades.length : 0;
  const avgWinner = winners.length > 0 ? totalWins / winners.length : 0;
  const avgLoser = losers.length > 0 ? losers.reduce((s, t) => s + t.return_pct, 0) / losers.length : 0;

  return { profitFactor, winRate, avgWinner, avgLoser };
}

function emptyResult(): BacktestResult {
  return {
    trades: [],
    equity_curve: [],
    cagr: 0,
    sharpe: 0,
    max_drawdown: 0,
    profit_factor: 0,
    total_trades: 0,
    trades_per_year: 0,
    win_rate: 0,
    avg_winner: 0,
    avg_loser: 0,
    final_signal: 'Cash',
  };
}

// ===== Pre-computed Rule Signals for Fast Discovery =====

/**
 * Pre-computed boolean matrix: for each rule, whether it's active on each trading date.
 * Computing this once for all 160 rules × ~6000 dates takes ~30-60s,
 * but then each strategy backtest is pure array indexing (~0.1ms).
 */
export interface PrecomputedSignals {
  dates: string[];
  /** Map from rule.id to boolean array (one per date) */
  ruleActive: Map<string, boolean[]>;
  /** Pre-computed asset returns between consecutive dates for each tradable asset */
  dailyReturns: Record<string, number[]>; // ticker -> return[i] = return from dates[i-1] to dates[i]
  /** Pre-computed asset returns between any two date indices */
  cumulativeReturns: Record<string, number[]>; // ticker -> cumReturn[i] = cumulative return factor at dates[i]
}

/**
 * Pre-compute all rule signals and price data for a date range.
 * Call this once before running discovery on many strategies.
 */
export function precomputeSignals(
  allRules: RuleDefinition[],
  data: MarketData,
  startDate: string,
  endDate: string,
  onProgress?: (pct: number, phase: string) => void
): PrecomputedSignals {
  const dates = getTradingDates(data, startDate, endDate);

  // Pre-compute rule activations
  const ruleActive = new Map<string, boolean[]>();
  for (let r = 0; r < allRules.length; r++) {
    const rule = allRules[r];
    const active: boolean[] = new Array(dates.length);
    for (let d = 0; d < dates.length; d++) {
      try {
        active[d] = rule.evaluate(data, dates[d]);
      } catch {
        active[d] = false;
      }
    }
    ruleActive.set(rule.id, active);

    if (onProgress && r % 10 === 0) {
      onProgress(Math.round((r / allRules.length) * 100), `Pre-computing rule ${r + 1}/${allRules.length}: ${rule.name}`);
    }
  }

  // Pre-compute daily returns and cumulative returns for tradable assets
  const dailyReturns: Record<string, number[]> = {};
  const cumulativeReturns: Record<string, number[]> = {};

  for (const asset of ['GLD', 'SLV', 'QQQ'] as Asset[]) {
    const returns: number[] = new Array(dates.length).fill(0);
    const cumReturn: number[] = new Array(dates.length).fill(1);

    for (let i = 1; i < dates.length; i++) {
      returns[i] = getAssetReturn(data, asset, dates[i - 1], dates[i]);
      cumReturn[i] = cumReturn[i - 1] * (1 + returns[i]);
    }
    dailyReturns[asset] = returns;
    cumulativeReturns[asset] = cumReturn;
  }
  // Cash
  dailyReturns['Cash'] = new Array(dates.length).fill(0);
  cumulativeReturns['Cash'] = new Array(dates.length).fill(1);

  return { dates, ruleActive, dailyReturns, cumulativeReturns };
}

/**
 * Fast backtest using pre-computed signals. ~100-1000x faster than backtestStrategy.
 */
export function backtestStrategyFast(
  ruleIds: string[],
  ruleAssets: Asset[],
  ruleLogic: 'majority' | 'all' | 'any',
  precomputed: PrecomputedSignals
): BacktestResult {
  const { dates, ruleActive, dailyReturns, cumulativeReturns } = precomputed;

  if (dates.length < 2) return emptyResult();

  // Look up the pre-computed boolean arrays for this strategy's rules
  const ruleArrays: boolean[][] = [];
  const assets: Asset[] = [];
  for (let i = 0; i < ruleIds.length; i++) {
    const arr = ruleActive.get(ruleIds[i]);
    if (arr) {
      ruleArrays.push(arr);
      assets.push(ruleAssets[i]);
    }
  }
  if (ruleArrays.length === 0) return emptyResult();

  const numRules = ruleArrays.length;
  const halfRules = numRules / 2;

  // State
  let equity = 1.0;
  let currentHolding: Asset = 'Cash';
  let holdingSince = 0;
  let tradeStartEquity = equity;
  let tradeStartDate = dates[0];

  const trades: TradeRecord[] = [];
  const equityCurve: { date: string; value: number }[] = [];
  let pendingSignal: { signal: Asset; signalDay: number } | null = null;

  for (let i = 0; i < dates.length; i++) {
    // Update equity
    if (i > 0 && currentHolding !== 'Cash') {
      equity *= (1 + dailyReturns[currentHolding][i]);
    }

    // Execute pending trade
    if (pendingSignal && pendingSignal.signalDay === i - 1) {
      // Record trade
      if (i > 0 && holdingSince < i) {
        const tradeDays = i - holdingSince;
        const tradeReturn = tradeStartEquity > 0 ? (equity - tradeStartEquity) / tradeStartEquity : 0;
        trades.push({
          from_date: tradeStartDate,
          to_date: dates[i],
          holding: currentHolding,
          days: tradeDays,
          return_pct: tradeReturn,
          good_call: tradeReturn >= 0, // Simplified for speed
        });
      }

      equity *= (1 - TRANSACTION_COST_BPS / 10000);
      currentHolding = pendingSignal.signal;
      holdingSince = i;
      tradeStartDate = dates[i];
      tradeStartEquity = equity;
      pendingSignal = null;
    }

    // Evaluate signal using pre-computed rule activations
    let activeCount = 0;
    const voteCounts: Record<Asset, number> = { GLD: 0, SLV: 0, QQQ: 0, Cash: 0 };

    for (let r = 0; r < numRules; r++) {
      if (ruleArrays[r][i]) {
        activeCount++;
        voteCounts[assets[r]]++;
      }
    }

    let signal: Asset = 'Cash';
    if (ruleLogic === 'majority' && activeCount > halfRules) {
      signal = fastMajorityVote(voteCounts);
    } else if (ruleLogic === 'all' && activeCount === numRules) {
      signal = fastMajorityVote(voteCounts);
    } else if (ruleLogic === 'any' && activeCount > 0) {
      signal = fastMajorityVote(voteCounts);
    }

    const daysSinceEntry = i - holdingSince;
    if (signal !== currentHolding && daysSinceEntry >= MIN_HOLD_DAYS) {
      pendingSignal = { signal, signalDay: i };
    }

    equityCurve.push({ date: dates[i], value: equity });
  }

  // Close final trade
  const lastDate = dates[dates.length - 1];
  const finalTradeDays = dates.length - 1 - holdingSince;
  if (finalTradeDays > 0) {
    const tradeReturn = tradeStartEquity > 0 ? (equity - tradeStartEquity) / tradeStartEquity : 0;
    trades.push({
      from_date: tradeStartDate,
      to_date: lastDate,
      holding: currentHolding,
      days: finalTradeDays,
      return_pct: tradeReturn,
      good_call: tradeReturn >= 0,
    });
  }

  // Final signal
  let finalActiveCount = 0;
  const finalVotes: Record<Asset, number> = { GLD: 0, SLV: 0, QQQ: 0, Cash: 0 };
  const lastIdx = dates.length - 1;
  for (let r = 0; r < numRules; r++) {
    if (ruleArrays[r][lastIdx]) {
      finalActiveCount++;
      finalVotes[assets[r]]++;
    }
  }
  let finalSignal: Asset = 'Cash';
  if (ruleLogic === 'majority' && finalActiveCount > halfRules) {
    finalSignal = fastMajorityVote(finalVotes);
  }

  // Compute metrics
  const totalYears = dates.length / 252;
  const cagr = totalYears > 0 ? Math.pow(equity, 1 / totalYears) - 1 : 0;
  const sharpe = computeSharpe(equityCurve);
  const maxDrawdown = computeMaxDrawdown(equityCurve);
  const { profitFactor, winRate, avgWinner, avgLoser } = computeTradeStats(trades);

  return {
    trades,
    equity_curve: equityCurve,
    cagr,
    sharpe,
    max_drawdown: maxDrawdown,
    profit_factor: profitFactor,
    total_trades: trades.length,
    trades_per_year: totalYears > 0 ? trades.length / totalYears : 0,
    win_rate: winRate,
    avg_winner: avgWinner,
    avg_loser: avgLoser,
    final_signal: finalSignal,
  };
}

function fastMajorityVote(counts: Record<Asset, number>): Asset {
  const priority: Asset[] = ['GLD', 'QQQ', 'SLV', 'Cash'];
  let best: Asset = 'Cash';
  let bestCount = 0;
  for (const asset of priority) {
    if (counts[asset] > bestCount) {
      bestCount = counts[asset];
      best = asset;
    }
  }
  return best;
}

// ===== Exported Helpers (used by validation) =====

export { evaluateSignal, getTradingDates, getAssetReturn, computeSharpe };
