import { sql } from '@vercel/postgres';
import StrategiesClient from './client';

export const dynamic = 'force-dynamic';

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

    // Fetch trades for each strategy
    const strategies = [];
    for (const row of rows) {
      const { rows: trades } = await sql`
        SELECT from_date::text, to_date::text, holding, days, return_pct, good_call
        FROM trades
        WHERE strategy_id = ${row.id}
        ORDER BY from_date ASC
      `;

      const { rows: periods } = await sql`
        SELECT period, strategy_return, gld_return, slv_return, qqq_return, sharpe, max_dd
        FROM period_breakdowns
        WHERE strategy_id = ${row.id}
        ORDER BY period ASC
      `;

      strategies.push({
        strategy_id: row.id,
        name: row.name,
        rules: row.rules || [],
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
        trades: trades.map(t => ({
          from_date: t.from_date,
          to_date: t.to_date,
          holding: t.holding,
          days: t.days,
          return_pct: t.return_pct,
          good_call: t.good_call,
        })),
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

    return strategies;
  } catch {
    return [];
  }
}

export default async function StrategiesPage() {
  const strategies = await getSavedStrategies();
  return <StrategiesClient strategies={strategies} />;
}
