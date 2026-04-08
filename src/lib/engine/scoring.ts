// ===== RATING & ROBUSTNESS SCORING =====
// Computes 0-100 scores and letter grades for strategy quality and statistical confidence

import { scoreToGrade } from '@/lib/types';
import type { Grade } from '@/lib/types';
import type { BacktestResult } from './backtest';

// ===== Rating Score (Performance Quality) =====

/**
 * Compute a 0-100 rating score based on backtest performance metrics.
 *
 * Calibrated for tactical allocation strategies (GLD/SLV/QQQ/Cash):
 * - CAGR:         0-25 points (5% = decent, 12% = excellent for this asset mix)
 * - Sharpe:       0-25 points (0.5 = decent, 1.2 = excellent for multi-asset)
 * - Max Drawdown: 0-20 points (< 10% = excellent, > 30% = poor)
 * - Profit Factor: 0-15 points (1.5 = decent, 3.0 = excellent)
 * - Trades/yr:    0-15 points (sweet spot 2-6/yr = max)
 */
export function computeRatingScore(result: BacktestResult): number {
  const cagrPoints = clampScale(result.cagr, 0, 0.12, 0, 25);
  const sharpePoints = clampScale(result.sharpe, 0, 1.2, 0, 25);

  // Max drawdown is negative; 0% DD = 20 points, -30% DD = 0 points
  const ddFraction = Math.abs(result.max_drawdown);
  const ddPoints = clampScale(ddFraction, 0.30, 0, 0, 20);

  const pfPoints = clampScale(result.profit_factor, 0, 3.0, 0, 15);

  // Trades per year: sweet spot is 2-6. Bell curve scoring.
  const tpyPoints = tradesPerYearScore(result.trades_per_year);

  const total = cagrPoints + sharpePoints + ddPoints + pfPoints + tpyPoints;
  return Math.round(Math.max(0, Math.min(100, total)));
}

/**
 * Trades per year scoring (0-15 points).
 * Sweet spot: 2-6 trades/yr = full 15 points.
 * <1 trade/yr = 3 points (too passive).
 * >12 trades/yr = 3 points (too active).
 * Linear interpolation between.
 */
function tradesPerYearScore(tpy: number): number {
  if (tpy >= 2 && tpy <= 6) return 15;
  if (tpy < 2) {
    // 0 -> 3, 2 -> 15
    return clampScale(tpy, 0, 2, 3, 15);
  }
  // > 6: 6 -> 15, 12+ -> 3
  return clampScale(tpy, 6, 12, 15, 3);
}

// ===== Robustness Score (Statistical Confidence) =====

/**
 * Compute a 0-100 robustness score based on statistical validation metrics.
 *
 * Breakdown:
 * - CPCV pass rate:     0-35 points (scaled 0.5-1.0 to 0-35)
 * - DSR:                0-30 points (scaled 0.5-1.0 to 0-30)
 * - PBO:                0-20 points (scaled 0.5-0.0 to 0-20, lower PBO = more points)
 * - Sensitivity pass:   0-10 points (pass=10, fail=0)
 * - Rule necessity:     0-5 points (all necessary=5, each unnecessary deducts 1)
 */
export function computeRobustnessScore(
  cpcvPassRate: number,
  dsr: number,
  pbo: number,
  sensitivityPass: boolean,
  unnecessaryRules: string[]
): number {
  // CPCV: 0.5 -> 0pts, 1.0 -> 35pts
  const cpcvPoints = clampScale(cpcvPassRate, 0.5, 1.0, 0, 35);

  // DSR: 0.5 -> 0pts, 1.0 -> 30pts
  const dsrPoints = clampScale(dsr, 0.5, 1.0, 0, 30);

  // PBO: 0.5 -> 0pts, 0.0 -> 20pts (inverted)
  const pboPoints = clampScale(pbo, 0.5, 0, 0, 20);

  // Sensitivity: binary
  const sensitivityPoints = sensitivityPass ? 10 : 0;

  // Rule necessity: 5 points, deduct 1 per unnecessary rule
  const necessityPoints = Math.max(0, 5 - unnecessaryRules.length);

  const total = cpcvPoints + dsrPoints + pboPoints + sensitivityPoints + necessityPoints;
  return Math.round(Math.max(0, Math.min(100, total)));
}

// ===== Grade helpers =====

export interface ScoredResult {
  score: number;
  grade: Grade;
}

/**
 * Score and grade a backtest result.
 */
export function rateStrategy(result: BacktestResult): ScoredResult {
  const score = computeRatingScore(result);
  return { score, grade: scoreToGrade(score) };
}

/**
 * Score and grade robustness.
 */
export function gradeRobustness(
  cpcvPassRate: number,
  dsr: number,
  pbo: number,
  sensitivityPass: boolean,
  unnecessaryRules: string[]
): ScoredResult {
  const score = computeRobustnessScore(cpcvPassRate, dsr, pbo, sensitivityPass, unnecessaryRules);
  return { score, grade: scoreToGrade(score) };
}

// ===== Utility =====

/**
 * Linear interpolation with clamping.
 * Maps value from [inMin, inMax] to [outMin, outMax], clamped.
 */
function clampScale(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number {
  if (inMin === inMax) return value >= inMin ? outMax : outMin;

  // Handle inverted ranges
  const t = (value - inMin) / (inMax - inMin);
  const clamped = Math.max(0, Math.min(1, t));
  return outMin + clamped * (outMax - outMin);
}
