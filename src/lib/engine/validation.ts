// ===== STATISTICAL VALIDATION PIPELINE =====
// CPCV, Deflated Sharpe Ratio, PBO, Sensitivity, Rule Necessity
// Based on Lopez de Prado's frameworks

import type { RuleDefinition, MarketData } from '@/lib/types';
import { backtestStrategy, getTradingDates } from './backtest';
import type { BacktestResult } from './backtest';

// ===== Normal CDF — Abramowitz & Stegun rational approximation =====

/**
 * Standard normal CDF using Abramowitz & Stegun formula 26.2.17.
 * Maximum error < 7.5e-8.
 */
function normalCDF(x: number): number {
  if (x === Infinity) return 1;
  if (x === -Infinity) return 0;

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2);

  return 0.5 * (1.0 + sign * y);
}

// ===== Combinatorial helpers =====

/**
 * Generate all combinations of size k from array of indices [0..n-1].
 */
function combinations(n: number, k: number): number[][] {
  const result: number[][] = [];
  const combo: number[] = [];

  function backtrack(start: number) {
    if (combo.length === k) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i < n; i++) {
      combo.push(i);
      backtrack(i + 1);
      combo.pop();
    }
  }

  backtrack(0);
  return result;
}

/**
 * Generate up to maxCount random combinations of size k from [0..n-1].
 * Uses Fisher-Yates-based sampling for efficiency.
 */
function randomCombinations(n: number, k: number, maxCount: number): number[][] {
  const total = binomialCoeff(n, k);
  if (total <= maxCount) return combinations(n, k);

  const seen = new Set<string>();
  const result: number[][] = [];

  while (result.length < maxCount) {
    // Generate a random combination
    const indices: number[] = [];
    const pool = Array.from({ length: n }, (_, i) => i);
    for (let i = 0; i < k; i++) {
      const j = i + Math.floor(Math.random() * (n - i));
      [pool[i], pool[j]] = [pool[j], pool[i]];
      indices.push(pool[i]);
    }
    indices.sort((a, b) => a - b);
    const key = indices.join(',');
    if (!seen.has(key)) {
      seen.add(key);
      result.push(indices);
    }
  }

  return result;
}

function binomialCoeff(n: number, k: number): number {
  if (k > n) return 0;
  if (k === 0 || k === n) return 1;
  let result = 1;
  for (let i = 0; i < Math.min(k, n - k); i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return Math.round(result);
}

// ===== CPCV (Combinatorial Purged Cross-Validation) =====

export interface CPCVResult {
  passRate: number;
  results: { trainReturn: number; testReturn: number }[];
}

/**
 * Combinatorial Purged Cross-Validation (Lopez de Prado).
 *
 * Splits date range into numBlocks equal blocks, generates C(numBlocks, 2) = 28 combinations.
 * For each: train on (numBlocks - 2) blocks, test on 2 held-out blocks.
 * Purges 15 trading days at block boundaries to prevent data leakage.
 *
 * @returns passRate (fraction of test periods with positive return) and individual results
 */
export function runCPCV(
  rules: RuleDefinition[],
  ruleLogic: 'majority' | 'all' | 'any',
  data: MarketData,
  numBlocks: number = 8
): CPCVResult {
  // Get the full date range from available data
  const allDates = getAllDates(data);
  if (allDates.length < numBlocks * 20) {
    return { passRate: 0, results: [] };
  }

  const PURGE_DAYS = 15;

  // Split into numBlocks equal blocks
  const blockSize = Math.floor(allDates.length / numBlocks);
  const blocks: { start: string; end: string; startIdx: number; endIdx: number }[] = [];
  for (let i = 0; i < numBlocks; i++) {
    const startIdx = i * blockSize;
    const endIdx = i === numBlocks - 1 ? allDates.length - 1 : (i + 1) * blockSize - 1;
    blocks.push({
      start: allDates[startIdx],
      end: allDates[endIdx],
      startIdx,
      endIdx,
    });
  }

  // Generate all C(numBlocks, 2) test combinations
  const testCombos = combinations(numBlocks, 2);
  const results: { trainReturn: number; testReturn: number }[] = [];

  for (const testIndices of testCombos) {
    const trainIndices = Array.from({ length: numBlocks }, (_, i) => i).filter(
      (i) => !testIndices.includes(i)
    );

    // Build purged training dates
    const testBlockBoundaries = new Set<number>();
    for (const ti of testIndices) {
      // Purge PURGE_DAYS around test block boundaries
      const block = blocks[ti];
      for (let d = Math.max(0, block.startIdx - PURGE_DAYS); d <= Math.min(allDates.length - 1, block.endIdx + PURGE_DAYS); d++) {
        testBlockBoundaries.add(d);
      }
    }

    // Train: backtest on training blocks (concatenated, excluding purge zones)
    // We run the backtest on each contiguous training segment and aggregate
    let trainEquity = 1.0;
    for (const ti of trainIndices) {
      const block = blocks[ti];
      // Adjust for purge: shrink the block edges if they border a test block
      let effectiveStart = block.startIdx;
      let effectiveEnd = block.endIdx;

      // Skip purged dates at edges
      while (effectiveStart <= effectiveEnd && testBlockBoundaries.has(effectiveStart)) {
        effectiveStart++;
      }
      while (effectiveEnd >= effectiveStart && testBlockBoundaries.has(effectiveEnd)) {
        effectiveEnd--;
      }

      if (effectiveEnd - effectiveStart < 20) continue; // too small after purge

      const result = backtestStrategy(
        rules,
        ruleLogic,
        data,
        allDates[effectiveStart],
        allDates[effectiveEnd]
      );
      trainEquity *= (1 + result.cagr) > 0 ? (1 + result.cagr) : 0.001;
    }
    const trainReturn = trainEquity - 1;

    // Test: backtest on test blocks
    let testEquity = 1.0;
    for (const ti of testIndices) {
      const block = blocks[ti];
      const result = backtestStrategy(rules, ruleLogic, data, block.start, block.end);
      const periodReturn = result.equity_curve.length > 0
        ? result.equity_curve[result.equity_curve.length - 1].value / result.equity_curve[0].value - 1
        : 0;
      testEquity *= (1 + periodReturn);
    }
    const testReturn = testEquity - 1;

    results.push({ trainReturn, testReturn });
  }

  const passCount = results.filter((r) => r.testReturn > 0).length;
  const passRate = results.length > 0 ? passCount / results.length : 0;

  return { passRate, results };
}

// ===== Deflated Sharpe Ratio =====

/**
 * Deflated Sharpe Ratio (Bailey & Lopez de Prado, 2014).
 *
 * Tests whether the observed Sharpe ratio is statistically significant
 * after accounting for multiple testing (N strategies tested).
 *
 * Formula: PSR = Phi((SR_hat - SR*) * sqrt(T-1) / sqrt(1 - skew*SR_hat + (kurt-1)/4 * SR_hat^2))
 * Where SR* = expected maximum Sharpe under null hypothesis given N trials.
 *
 * @param sharpe - observed annualized Sharpe ratio
 * @param numStrategiesTested - number of strategies tested (multiple testing correction)
 * @param sampleLength - number of observations (trading days)
 * @param skewness - skewness of returns
 * @param kurtosis - excess kurtosis of returns (normal = 0, not 3)
 * @returns probability 0-1 that the Sharpe is genuine
 */
export function computeDSR(
  sharpe: number,
  numStrategiesTested: number,
  sampleLength: number,
  skewness: number,
  kurtosis: number
): number {
  if (sampleLength <= 1 || numStrategiesTested <= 0) return 0;

  const T = sampleLength;
  const N = numStrategiesTested;

  // Expected maximum Sharpe under null (Euler-Mascheroni approximation)
  // E[max(SR)] ≈ sqrt(2 * ln(N)) - (ln(pi) + euler_gamma) / (2 * sqrt(2 * ln(N)))
  // where euler_gamma ≈ 0.5772
  const eulerGamma = 0.5772156649;
  let srStar: number;
  if (N <= 1) {
    srStar = 0;
  } else {
    const sqrtTwoLnN = Math.sqrt(2 * Math.log(N));
    srStar = sqrtTwoLnN - (Math.log(Math.PI) + eulerGamma) / (2 * sqrtTwoLnN);
  }

  // De-annualize Sharpe for the formula (formula works with per-period Sharpe)
  const srHat = sharpe / Math.sqrt(252);

  // Denominator: standard error of the Sharpe ratio estimator
  // SE(SR) = sqrt((1 - skew*SR + (kurt-1)/4 * SR^2) / (T-1))
  // Note: kurtosis here is excess kurtosis (normal = 0)
  const varianceSR = (1 - skewness * srHat + ((kurtosis) / 4) * srHat * srHat) / (T - 1);

  if (varianceSR <= 0) return sharpe > 0 ? 1 : 0;

  const seSR = Math.sqrt(varianceSR);

  // Also de-annualize srStar for comparison
  // srStar is already in per-period terms from the formula

  const zScore = (srHat - srStar) / seSR;
  return normalCDF(zScore);
}

/**
 * Compute skewness and kurtosis from an equity curve for DSR input.
 */
export function computeReturnMoments(
  equityCurve: { date: string; value: number }[]
): { skewness: number; kurtosis: number } {
  if (equityCurve.length < 3) return { skewness: 0, kurtosis: 0 };

  const returns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1].value;
    if (prev === 0) continue;
    returns.push((equityCurve[i].value - prev) / prev);
  }

  const n = returns.length;
  if (n < 3) return { skewness: 0, kurtosis: 0 };

  const mean = returns.reduce((s, v) => s + v, 0) / n;
  const m2 = returns.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const m3 = returns.reduce((s, v) => s + (v - mean) ** 3, 0) / n;
  const m4 = returns.reduce((s, v) => s + (v - mean) ** 4, 0) / n;

  const stdDev = Math.sqrt(m2);
  if (stdDev === 0) return { skewness: 0, kurtosis: 0 };

  const skewness = m3 / (stdDev ** 3);
  const kurtosis = m4 / (stdDev ** 4) - 3; // excess kurtosis

  return { skewness, kurtosis };
}

// ===== Probability of Backtest Overfitting (PBO) =====

/**
 * Probability of Backtest Overfitting (Bailey, Borwein, Lopez de Prado & Zhu, 2017).
 *
 * Partitions data into S subperiods. For C(S, S/2) in-sample/out-of-sample splits,
 * finds the best in-sample strategy variant (by perturbing parameters slightly)
 * and checks whether it underperforms median out-of-sample.
 *
 * PBO = fraction where IS-best underperforms median OOS.
 * Lower is better (0 = no overfitting detected, 1 = completely overfit).
 *
 * @param numSubperiods - number of subperiods (default 16)
 * @returns PBO value 0-1
 */
export function computePBO(
  rules: RuleDefinition[],
  ruleLogic: 'majority' | 'all' | 'any',
  data: MarketData,
  numSubperiods: number = 16
): number {
  const allDates = getAllDates(data);
  if (allDates.length < numSubperiods * 20) return 1; // insufficient data

  const halfS = Math.floor(numSubperiods / 2);
  const blockSize = Math.floor(allDates.length / numSubperiods);

  // Build subperiod blocks
  const blocks: { start: string; end: string }[] = [];
  for (let i = 0; i < numSubperiods; i++) {
    const startIdx = i * blockSize;
    const endIdx = i === numSubperiods - 1 ? allDates.length - 1 : (i + 1) * blockSize - 1;
    blocks.push({ start: allDates[startIdx], end: allDates[endIdx] });
  }

  // Generate rule variants by creating slightly different rule sets
  // We create variants by toggling each rule on/off (subset strategies)
  const variants = generateRuleVariants(rules);

  // Sample combinations (cap at 1000)
  const combos = randomCombinations(numSubperiods, halfS, 1000);

  let overfitCount = 0;

  for (const isIndices of combos) {
    const oosIndices = Array.from({ length: numSubperiods }, (_, i) => i).filter(
      (i) => !isIndices.includes(i)
    );

    // Compute IS performance for each variant
    const isPerformances: number[] = [];
    const oosPerformances: number[] = [];

    for (const variant of variants) {
      // In-sample: average Sharpe across IS blocks
      let isSharpeSum = 0;
      let isBlockCount = 0;
      for (const idx of isIndices) {
        const result = backtestStrategy(variant, ruleLogic, data, blocks[idx].start, blocks[idx].end);
        isSharpeSum += result.sharpe;
        isBlockCount++;
      }
      isPerformances.push(isBlockCount > 0 ? isSharpeSum / isBlockCount : 0);

      // Out-of-sample: average Sharpe across OOS blocks
      let oosSharpeSum = 0;
      let oosBlockCount = 0;
      for (const idx of oosIndices) {
        const result = backtestStrategy(variant, ruleLogic, data, blocks[idx].start, blocks[idx].end);
        oosSharpeSum += result.sharpe;
        oosBlockCount++;
      }
      oosPerformances.push(oosBlockCount > 0 ? oosSharpeSum / oosBlockCount : 0);
    }

    // Find IS-best variant
    let bestISIdx = 0;
    for (let i = 1; i < isPerformances.length; i++) {
      if (isPerformances[i] > isPerformances[bestISIdx]) bestISIdx = i;
    }

    // Check if IS-best underperforms OOS median
    const sortedOOS = [...oosPerformances].sort((a, b) => a - b);
    const medianOOS = sortedOOS[Math.floor(sortedOOS.length / 2)];

    if (oosPerformances[bestISIdx] < medianOOS) {
      overfitCount++;
    }
  }

  return combos.length > 0 ? overfitCount / combos.length : 1;
}

/**
 * Generate rule variants for PBO testing.
 * Creates subsets of the rule set by removing one rule at a time,
 * plus the full rule set. Caps at reasonable number.
 */
function generateRuleVariants(rules: RuleDefinition[]): RuleDefinition[][] {
  const variants: RuleDefinition[][] = [rules]; // Full set

  // Single-rule-removal variants
  for (let i = 0; i < rules.length; i++) {
    const subset = rules.filter((_, idx) => idx !== i);
    if (subset.length > 0) {
      variants.push(subset);
    }
  }

  // If we have enough rules, also add some two-rule-removal variants
  if (rules.length >= 4) {
    for (let i = 0; i < rules.length; i++) {
      for (let j = i + 1; j < rules.length; j++) {
        const subset = rules.filter((_, idx) => idx !== i && idx !== j);
        if (subset.length > 0) {
          variants.push(subset);
        }
        if (variants.length >= 20) break; // cap variant count for performance
      }
      if (variants.length >= 20) break;
    }
  }

  return variants;
}

// ===== Sensitivity Test =====

/**
 * Test parameter sensitivity by perturbing rule thresholds +-20%.
 * If Sharpe drops by more than 50% for any perturbation, fail.
 *
 * Since rules use evaluate() functions with baked-in thresholds,
 * we test sensitivity by removing each rule one at a time and checking
 * if the remaining rules still produce reasonable performance.
 * We also test by shifting the evaluation date window.
 *
 * @returns true if strategy survives sensitivity test
 */
export function testSensitivity(
  rules: RuleDefinition[],
  ruleLogic: 'majority' | 'all' | 'any',
  data: MarketData
): boolean {
  const allDates = getAllDates(data);
  if (allDates.length < 100) return false;

  const startDate = allDates[0];
  const endDate = allDates[allDates.length - 1];

  // Baseline performance
  const baseline = backtestStrategy(rules, ruleLogic, data, startDate, endDate);
  const baselineSharpe = baseline.sharpe;

  if (baselineSharpe <= 0) return false; // Can't test sensitivity of a losing strategy

  // Test 1: Time-window sensitivity — shift start date forward by ~10% of data
  const shiftDays = Math.floor(allDates.length * 0.1);
  const windows = [
    { start: allDates[shiftDays], end: endDate },
    { start: startDate, end: allDates[allDates.length - 1 - shiftDays] },
    { start: allDates[Math.floor(shiftDays / 2)], end: allDates[allDates.length - 1 - Math.floor(shiftDays / 2)] },
  ];

  for (const window of windows) {
    const result = backtestStrategy(rules, ruleLogic, data, window.start, window.end);
    if (result.sharpe < baselineSharpe * 0.5) {
      return false; // Sharpe dropped >50%
    }
  }

  // Test 2: Rule perturbation — remove each rule one at a time
  if (rules.length > 1) {
    for (let i = 0; i < rules.length; i++) {
      const perturbed = rules.filter((_, idx) => idx !== i);
      const result = backtestStrategy(perturbed, ruleLogic, data, startDate, endDate);
      // We don't fail here — rule necessity is a separate test
      // But if removing ANY single rule causes Sharpe to go below 50% of baseline,
      // that indicates fragility
      if (result.sharpe < baselineSharpe * 0.5) {
        return false;
      }
    }
  }

  // Test 3: Subsample stability — test on 5 random 80% subsamples
  for (let trial = 0; trial < 5; trial++) {
    const subLength = Math.floor(allDates.length * 0.8);
    const maxStart = allDates.length - subLength;
    const startIdx = Math.floor(Math.random() * maxStart);
    const result = backtestStrategy(
      rules,
      ruleLogic,
      data,
      allDates[startIdx],
      allDates[startIdx + subLength - 1]
    );
    if (result.sharpe < baselineSharpe * 0.5) {
      return false;
    }
  }

  return true;
}

// ===== Rule Necessity Test =====

/**
 * Test whether each rule contributes meaningfully to the strategy.
 * Remove each rule one at a time and re-run backtest.
 * If Sharpe stays within 5% or improves, the rule is unnecessary.
 *
 * @returns array of unnecessary rule IDs (empty = all rules contribute)
 */
export function testRuleNecessity(
  rules: RuleDefinition[],
  ruleLogic: 'majority' | 'all' | 'any',
  data: MarketData
): string[] {
  if (rules.length <= 1) return []; // Can't remove the only rule

  const allDates = getAllDates(data);
  if (allDates.length < 50) return [];

  const startDate = allDates[0];
  const endDate = allDates[allDates.length - 1];

  // Baseline
  const baseline = backtestStrategy(rules, ruleLogic, data, startDate, endDate);
  const baselineSharpe = baseline.sharpe;

  const unnecessary: string[] = [];

  for (let i = 0; i < rules.length; i++) {
    const reduced = rules.filter((_, idx) => idx !== i);
    const result = backtestStrategy(reduced, ruleLogic, data, startDate, endDate);

    // Rule is unnecessary if Sharpe is within 5% of baseline or better
    if (result.sharpe >= baselineSharpe * 0.95) {
      unnecessary.push(rules[i].id);
    }
  }

  return unnecessary;
}

// ===== Utility =====

/**
 * Get all available trading dates from the market data, sorted ascending.
 */
function getAllDates(data: MarketData): string[] {
  const refTicker = data.prices['SPY.US'] ? 'SPY.US' : data.prices['SPY'] ? 'SPY' : data.prices['GLD.US'] ? 'GLD.US' : data.prices['GLD'] ? 'GLD' : Object.keys(data.prices)[0];
  if (!refTicker || !data.prices[refTicker]) return [];

  return data.prices[refTicker]
    .map((row) => row.date)
    .sort();
}
