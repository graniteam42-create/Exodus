import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function GET(req: NextRequest) {
  const pool = req.nextUrl.searchParams.get('pool');
  const debug = req.nextUrl.searchParams.get('debug');

  try {
    // Debug endpoint: show counts and sample data
    if (debug) {
      const { rows: counts } = await sql`
        SELECT
          (SELECT COUNT(*)::int FROM strategies) as strategies_count,
          (SELECT COUNT(*)::int FROM strategy_results) as results_count,
          (SELECT COUNT(*)::int FROM saved_strategies) as saved_count,
          (SELECT COUNT(*)::int FROM trades) as trades_count
      `;
      const { rows: savedIds } = await sql`SELECT strategy_id, saved_at::text FROM saved_strategies LIMIT 10`;
      const { rows: topStrategies } = await sql`
        SELECT s.id, sr.rating_score, sr.rating_grade
        FROM strategies s LEFT JOIN strategy_results sr ON s.id = sr.strategy_id
        ORDER BY sr.rating_score DESC NULLS LAST LIMIT 5
      `;
      return NextResponse.json({ counts: counts[0], saved_ids: savedIds, top_strategies: topStrategies });
    }

    if (pool) {
      const { rows } = await sql`
        SELECT s.id as strategy_id, s.name, s.rules,
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
      return NextResponse.json(rows);
    }

    // Default: saved strategies only
    const { rows } = await sql`
      SELECT s.id as strategy_id, s.name, s.rules,
             sr.signal, sr.rating_score, sr.robustness_score,
             sr.cagr, sr.sharpe, sr.max_drawdown, sr.profit_factor
      FROM strategies s
      JOIN saved_strategies ss ON s.id = ss.strategy_id
      LEFT JOIN strategy_results sr ON s.id = sr.strategy_id
      ORDER BY sr.rating_score DESC
    `;
    return NextResponse.json(rows);
  } catch (error) {
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action, strategy_id } = body;

  try {
    if (action === 'save') {
      // Verify the strategy exists first
      const { rows: check } = await sql`SELECT id FROM strategies WHERE id = ${strategy_id}`;
      if (check.length === 0) {
        return NextResponse.json({ error: `Strategy ${strategy_id} not found in strategies table` }, { status: 404 });
      }
      await sql`
        INSERT INTO saved_strategies (strategy_id) VALUES (${strategy_id})
        ON CONFLICT (strategy_id) DO NOTHING
      `;
      // Read back to verify
      const { rows: verify } = await sql`SELECT strategy_id FROM saved_strategies WHERE strategy_id = ${strategy_id}`;
      if (verify.length === 0) {
        return NextResponse.json({ error: 'Save INSERT succeeded but row not found on read-back' }, { status: 500 });
      }
      const { rows: totalSaved } = await sql`SELECT COUNT(*)::int as cnt FROM saved_strategies`;
      return NextResponse.json({ ok: true, verified: true, total_saved: totalSaved[0].cnt });
    }

    if (action === 'unsave') {
      await sql`DELETE FROM saved_strategies WHERE strategy_id = ${strategy_id}`;
      return NextResponse.json({ ok: true });
    }

    if (action === 'clear_pool') {
      // Delete all non-saved strategies and their results/trades
      await sql`DELETE FROM trades WHERE strategy_id NOT IN (SELECT strategy_id FROM saved_strategies)`;
      await sql`DELETE FROM strategy_results WHERE strategy_id NOT IN (SELECT strategy_id FROM saved_strategies)`;
      await sql`DELETE FROM strategies WHERE id NOT IN (SELECT strategy_id FROM saved_strategies)`;
      await sql`DELETE FROM discovery_runs`;
      return NextResponse.json({ ok: true });
    }

    if (action === 'clear_all') {
      // Nuclear option: delete EVERYTHING
      await sql`DELETE FROM saved_strategies`;
      await sql`DELETE FROM trades`;
      await sql`DELETE FROM strategy_results`;
      await sql`DELETE FROM strategies`;
      await sql`DELETE FROM discovery_runs`;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
