import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function GET(req: NextRequest) {
  const pool = req.nextUrl.searchParams.get('pool');

  try {
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
      await sql`
        INSERT INTO saved_strategies (strategy_id) VALUES (${strategy_id})
        ON CONFLICT (strategy_id) DO NOTHING
      `;
      return NextResponse.json({ ok: true });
    }

    if (action === 'unsave') {
      await sql`DELETE FROM saved_strategies WHERE strategy_id = ${strategy_id}`;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
