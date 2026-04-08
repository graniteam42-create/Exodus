import { sql } from '@vercel/postgres';
import DiscoveryClient from './client';

export const dynamic = 'force-dynamic';

async function getPoolStrategies() {
  try {
    const { rows } = await sql`
      SELECT s.id, s.name, s.rules,
             sr.signal, sr.rating_score, sr.rating_grade,
             sr.robustness_score, sr.robustness_grade,
             sr.cagr, sr.sharpe, sr.max_drawdown, sr.profit_factor,
             sr.trades_per_year, sr.total_trades,
             sr.cpcv_pass_rate, sr.dsr, sr.pbo, sr.sensitivity_pass,
             CASE WHEN ss.strategy_id IS NOT NULL THEN true ELSE false END as saved
      FROM strategies s
      LEFT JOIN strategy_results sr ON s.id = sr.strategy_id
      LEFT JOIN saved_strategies ss ON s.id = ss.strategy_id
      ORDER BY sr.rating_score DESC NULLS LAST
      LIMIT 500
    `;

    return rows.map(r => ({
      strategy_id: r.id,
      name: r.name,
      rules: r.rules || [],
      signal: (r.signal || 'Cash') as 'GLD' | 'SLV' | 'QQQ' | 'Cash',
      rating_score: r.rating_score || 0,
      rating_grade: r.rating_grade || 'F',
      robustness_score: r.robustness_score || 0,
      robustness_grade: r.robustness_grade || 'F',
      cagr: r.cagr || 0,
      sharpe: r.sharpe || 0,
      max_drawdown: r.max_drawdown || 0,
      profit_factor: r.profit_factor || 0,
      trades_per_year: r.trades_per_year || 0,
      total_trades: r.total_trades || 0,
      cpcv_pass_rate: r.cpcv_pass_rate || 0,
      dsr: r.dsr || 0,
      pbo: r.pbo || 0,
      sensitivity_pass: r.sensitivity_pass || false,
      saved: r.saved || false,
    }));
  } catch {
    return [];
  }
}

async function getDataDate() {
  try {
    const { rows } = await sql`SELECT MAX(last_date)::text as d FROM data_metadata`;
    return rows[0]?.d || 'No data';
  } catch {
    return 'No data';
  }
}

export default async function DiscoveryPage() {
  const [strategies, dataDate] = await Promise.all([getPoolStrategies(), getDataDate()]);
  return <DiscoveryClient strategies={strategies} dataDate={dataDate} />;
}
