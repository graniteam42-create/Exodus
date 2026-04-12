import { sql } from '@vercel/postgres';
import StrategiesClient from './client';
import { allRules, getRule } from '@/lib/engine/rules';
import { backtestStrategy, getAssetReturn, getTradingDates } from '@/lib/engine/backtest';
import { computeCurrentSignal } from '@/lib/engine/signals';
import { buildMarketData } from '@/lib/data/cache';
import type { RuleInfo } from '@/components/StrategyCard';
import type { RuleDefinition } from '@/lib/types';

export const dynamic = 'force-dynamic';

// Build serializable rule info map (no evaluate functions)
const ruleInfoMap: Record<string, RuleInfo> = {};
for (const r of allRules) {
  ruleInfoMap[r.id] = { id: r.id, name: r.name, condition: r.condition, asset: r.asset, thesis: r.thesis, category: r.category };
}

async function getSavedStrategies() {
  try {
    const { rows } = await sql`
      SELECT s.id, s.name, s.rules, s.rule_logic,
             sr.signal, sr.rating_score, sr.rating_grade,
             sr.robustness_score, sr.robustness_grade,
             sr.cagr, sr.sharpe, sr.max_drawdown, sr.profit_factor,
             sr.trades_per_year, sr.total_trades,
             sr.cpcv_pass_rate, sr.dsr, sr.pbo, sr.sensitivity_pass,
             ss.saved_at::text
      FROM strategies s
      JOIN saved_strategies ss ON s.id = ss.strategy_id
      LEFT JOIN strategy_results sr ON s.id = sr.strategy_id
      ORDER BY sr.rating_score DESC NULLS LAST
    `;

    // Load market data once for re-backtesting all strategies
    let marketData = null;
    let benchmarks: Record<string, number> | null = null;
    try {
      marketData = await buildMarketData();
      // Compute B&H CAGR benchmarks for each asset
      const priceDates = Object.values(marketData.prices)[0];
      if (priceDates && priceDates.length >= 300) {
        const startDate = priceDates[252]?.date || priceDates[0].date;
        const endDate = priceDates[priceDates.length - 1].date;
        const totalYears = (priceDates.length - 252) / 252;
        benchmarks = {};
        for (const asset of ['GLD', 'SLV', 'QQQ'] as const) {
          const totalReturn = getAssetReturn(marketData, asset, startDate, endDate);
          benchmarks[asset] = totalYears > 0 ? Math.pow(1 + totalReturn, 1 / totalYears) - 1 : 0;
        }
      }
    } catch {
      // If market data unavailable, fall back to DB trades
    }

    const strategies = [];
    for (const row of rows) {
      const ruleIds: string[] = row.rules || [];
      const ruleDefs = ruleIds.map(id => getRule(id)).filter(Boolean) as RuleDefinition[];

      // Re-backtest to get full trade history
      let trades: { from_date: string; to_date: string; holding: string; days: number; return_pct: number; good_call: boolean }[] = [];

      if (marketData) {
        try {
          if (ruleDefs.length > 0) {
            const priceDates = Object.values(marketData.prices)[0];
            if (priceDates && priceDates.length >= 300) {
              const startDate = priceDates[252]?.date || priceDates[0].date;
              const endDate = priceDates[priceDates.length - 1].date;
              const result = backtestStrategy(ruleDefs, (row.rule_logic as 'majority') || 'majority', marketData, startDate, endDate);
              trades = result.trades.map(t => ({
                from_date: t.from_date,
                to_date: t.to_date,
                holding: t.holding,
                days: t.days,
                return_pct: t.return_pct,
                good_call: t.good_call,
              }));
            }
          }
        } catch {
          // Fall back to DB trades on error
        }
      }

      // Fall back to DB trades if re-backtest didn't produce results
      if (trades.length === 0) {
        const { rows: dbTrades } = await sql`
          SELECT from_date::text, to_date::text, holding, days, return_pct, good_call
          FROM trades
          WHERE strategy_id = ${row.id}
          ORDER BY from_date ASC
        `;
        trades = dbTrades.map(t => ({
          from_date: t.from_date,
          to_date: t.to_date,
          holding: t.holding,
          days: t.days,
          return_pct: t.return_pct,
          good_call: t.good_call,
        }));
      }

      // Compute current rule activation status
      let activeRules: { id: string; active: boolean; value?: string }[] | undefined;
      if (marketData && ruleDefs.length > 0) {
        try {
          const signalResult = computeCurrentSignal(ruleDefs, (row.rule_logic as string) || 'majority', marketData);
          activeRules = signalResult.activeRules;
        } catch {
          // Skip if signal computation fails
        }
      }

      const { rows: periods } = await sql`
        SELECT period, strategy_return, gld_return, slv_return, qqq_return, sharpe, max_dd
        FROM period_breakdowns
        WHERE strategy_id = ${row.id}
        ORDER BY period ASC
      `;

      strategies.push({
        strategy_id: row.id,
        name: row.name,
        rules: ruleIds,
        activeRules,
        signal: row.signal || 'Cash',
        rating_score: row.rating_score || 0,
        rating_grade: row.rating_grade || 'F',
        robustness_score: row.robustness_score || 0,
        robustness_grade: row.robustness_grade || 'F',
        cagr: row.cagr || 0,
        sharpe: row.sharpe || 0,
        max_drawdown: row.max_drawdown || 0,
        profit_factor: row.profit_factor || 0,
        trades_per_year: row.trades_per_year || 0,
        total_trades: row.total_trades || 0,
        cpcv_pass_rate: row.cpcv_pass_rate || 0,
        dsr: row.dsr || 0,
        pbo: row.pbo || 0,
        sensitivity_pass: row.sensitivity_pass || false,
        saved: true,
        saved_at: row.saved_at,
        trades,
        periods: periods.map(p => ({
          period: p.period,
          strategy_return: p.strategy_return,
          gld_return: p.gld_return,
          slv_return: p.slv_return,
          qqq_return: p.qqq_return,
          sharpe: p.sharpe,
          max_dd: p.max_dd,
        })),
      });
    }

    return { strategies, benchmarks };
  } catch {
    return { strategies: [], benchmarks: null };
  }
}

export default async function StrategiesPage() {
  const { strategies, benchmarks } = await getSavedStrategies();
  return <StrategiesClient strategies={strategies} ruleInfo={ruleInfoMap} benchmarks={benchmarks} />;
}
