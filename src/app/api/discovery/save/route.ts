import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const maxDuration = 30;

/**
 * POST /api/discovery/save
 * Batch-saves passing strategies from client-side discovery.
 * Called by the browser after backtesting completes.
 */
/** Sanitize a number for SQL: convert Infinity/NaN/null/undefined to 0 */
function sn(v: any): number {
  if (typeof v !== 'number' || !isFinite(v)) return 0;
  return v;
}

/** Sanitize a string for SQL: escape single quotes */
function ss(v: any): string {
  return String(v || '').replace(/'/g, "''");
}

export async function POST(req: NextRequest) {
  try {
    const { scoreToGrade } = await import('@/lib/types');
    const body = await req.json();
    const { strategies, run_id } = body as {
      strategies: {
        name: string;
        ruleIds: string[];
        ratingScore: number;
        robustnessScore: number;
        signal: string;
        cagr: number;
        sharpe: number;
        max_drawdown: number;
        profit_factor: number;
        trades_per_year: number;
        total_trades: number;
        win_rate: number;
        trades: { from_date: string; to_date: string; holding: string; days: number; return_pct: number; good_call: boolean }[];
      }[];
      run_id: string;
    };

    if (!strategies || strategies.length === 0) {
      return NextResponse.json({ saved: 0 });
    }

    const savedIds: string[] = [];

    // Batch insert in groups of 50
    const batchSize = 50;
    for (let i = 0; i < strategies.length; i += batchSize) {
      const batch = strategies.slice(i, i + batchSize);
      const ids = batch.map(() => `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
      savedIds.push(...ids);

      // Insert strategies
      const stratValues = batch.map((s, j) =>
        `('${ids[j]}', '${ss(s.name)}', '${ss(JSON.stringify(s.ruleIds))}', 'majority', '${ss(run_id)}')`
      ).join(',');
      await sql.query(
        `INSERT INTO strategies (id, name, rules, rule_logic, discovery_run_id) VALUES ${stratValues}`
      );

      // Insert results — sanitize ALL numbers to prevent Infinity/NaN crashing the INSERT
      const resValues = batch.map((s, j) =>
        `('${ids[j]}', '${ss(s.signal)}', ${sn(s.ratingScore)}, '${scoreToGrade(sn(s.ratingScore))}', ${sn(s.robustnessScore)}, '${scoreToGrade(sn(s.robustnessScore))}', ${sn(s.cagr)}, ${sn(s.sharpe)}, ${sn(s.max_drawdown)}, ${sn(s.profit_factor)}, ${sn(s.trades_per_year)}, ${sn(s.total_trades)}, 0, 0, 0, true)`
      ).join(',');
      await sql.query(
        `INSERT INTO strategy_results (strategy_id, signal, rating_score, rating_grade, robustness_score, robustness_grade, cagr, sharpe, max_drawdown, profit_factor, trades_per_year, total_trades, cpcv_pass_rate, dsr, pbo, sensitivity_pass) VALUES ${resValues}`
      );

      // Insert last 20 trades per strategy — sanitize numbers
      const tradeRows: string[] = [];
      for (let j = 0; j < batch.length; j++) {
        const trades = batch[j].trades?.slice(-20) || [];
        for (const t of trades) {
          tradeRows.push(
            `('${ids[j]}', '${ss(t.from_date)}', '${ss(t.to_date)}', '${ss(t.holding)}', ${sn(t.days)}, ${sn(t.return_pct)}, ${t.good_call ? 'true' : 'false'})`
          );
        }
      }
      if (tradeRows.length > 0) {
        for (let t = 0; t < tradeRows.length; t += 200) {
          const tradeBatch = tradeRows.slice(t, t + 200);
          await sql.query(
            `INSERT INTO trades (strategy_id, from_date, to_date, holding, days, return_pct, good_call) VALUES ${tradeBatch.join(',')}`
          );
        }
      }
    }

    // Verify what's actually in the DB
    const { rows: verifyCount } = await sql`SELECT COUNT(*)::int as cnt FROM strategies`;
    const { rows: topScores } = await sql`SELECT sr.rating_score, sr.rating_grade FROM strategy_results sr ORDER BY sr.rating_score DESC LIMIT 3`;

    console.log(`Discovery save: saved ${savedIds.length} strategies. DB total: ${verifyCount[0].cnt}. Top scores: ${JSON.stringify(topScores)}`);

    return NextResponse.json({
      saved: savedIds.length,
      strategy_ids: savedIds,
      db_total: verifyCount[0].cnt,
      top_scores: topScores,
      sample_input_score: strategies[0]?.ratingScore,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Discovery save error:', message);
    return NextResponse.json({ error: message, saved: 0 }, { status: 500 });
  }
}
