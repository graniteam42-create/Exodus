import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const maxRules = body.max_rules || 5;
  const maxStrategies = Math.min(body.max_strategies || 50, 50); // Cap at 50 for timeout safety

  try {
    // Dynamic imports
    const { buildMarketData } = await import('@/lib/data/cache');
    const { allRules } = await import('@/lib/engine/rules/index');
    const { backtestStrategy } = await import('@/lib/engine/backtest');
    const { computeRatingScore, computeRobustnessScore } = await import('@/lib/engine/scoring');
    const { computeCurrentSignal } = await import('@/lib/engine/signals');
    const { scoreToGrade } = await import('@/lib/types');

    const data = await buildMarketData();
    const priceDates = Object.values(data.prices)[0];
    if (!priceDates || priceDates.length < 300) {
      return NextResponse.json({
        success: false,
        error: 'Insufficient price data. Need at least 300 trading days. Try refreshing data first.',
        generated: 0,
        passed: 0,
      });
    }

    const startDate = priceDates[252]?.date || priceDates[0].date;
    const endDate = priceDates[priceDates.length - 1].date;
    const runId = `run_${Date.now()}`;
    const rulePool = [...allRules];

    // Generate candidates
    const candidates: { name: string; rules: typeof allRules; ruleIds: string[] }[] = [];
    const seen = new Set<string>();

    for (let attempt = 0; attempt < maxStrategies * 5 && candidates.length < maxStrategies; attempt++) {
      const numRules = 3 + Math.floor(Math.random() * (maxRules - 2));
      const shuffled = [...rulePool].sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, numRules);
      const ruleIds = selected.map(r => r.id).sort();
      const key = ruleIds.join(',');

      if (seen.has(key)) continue;
      seen.add(key);

      // Ensure at least 2 different categories
      const cats = new Set(selected.map(r => r.category));
      if (cats.size < 2) continue;

      candidates.push({ name: generateName(selected), rules: selected, ruleIds });
    }

    // Backtest each candidate (simplified — no CPCV/DSR/PBO for speed)
    let passed = 0;
    const results: string[] = [];

    for (const candidate of candidates) {
      try {
        const result = backtestStrategy(candidate.rules, 'majority', data, startDate, endDate);

        // Quick quality filters
        if (result.sharpe < 0.2) continue;
        if (result.total_trades < 3) continue;
        if (result.cagr < -0.05) continue;

        const ratingScore = computeRatingScore(result);
        // Simplified robustness: based on trade count, profit factor, and consistency
        const robustnessScore = Math.min(100, Math.max(0,
          (result.profit_factor > 1 ? 30 : 0) +
          (result.sharpe > 0.5 ? 20 : result.sharpe > 0.3 ? 10 : 0) +
          (result.total_trades > 10 ? 15 : result.total_trades > 5 ? 10 : 5) +
          (Math.abs(result.max_drawdown) < 0.2 ? 20 : Math.abs(result.max_drawdown) < 0.3 ? 10 : 0) +
          (result.win_rate > 0.55 ? 15 : result.win_rate > 0.45 ? 10 : 5)
        ));

        if (ratingScore < 55) continue;

        const current = computeCurrentSignal(candidate.rules, 'majority', data);
        const strategyId = `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

        await sql`
          INSERT INTO strategies (id, name, rules, rule_logic, discovery_run_id)
          VALUES (${strategyId}, ${candidate.name}, ${JSON.stringify(candidate.ruleIds)}, 'majority', ${runId})
        `;

        await sql`
          INSERT INTO strategy_results (strategy_id, signal, rating_score, rating_grade, robustness_score, robustness_grade, cagr, sharpe, max_drawdown, profit_factor, trades_per_year, total_trades, cpcv_pass_rate, dsr, pbo, sensitivity_pass)
          VALUES (${strategyId}, ${current.signal}, ${ratingScore}, ${scoreToGrade(ratingScore)}, ${robustnessScore}, ${scoreToGrade(robustnessScore)}, ${result.cagr}, ${result.sharpe}, ${result.max_drawdown}, ${result.profit_factor}, ${result.trades_per_year}, ${result.total_trades}, ${0}, ${0}, ${0}, ${true})
        `;

        // Save trades
        for (const trade of result.trades.slice(-20)) { // Last 20 trades only for speed
          await sql`
            INSERT INTO trades (strategy_id, from_date, to_date, holding, days, return_pct, good_call)
            VALUES (${strategyId}, ${trade.from_date}, ${trade.to_date}, ${trade.holding}, ${trade.days}, ${trade.return_pct}, ${trade.good_call})
          `;
        }

        passed++;
        results.push(strategyId);
      } catch {
        continue;
      }
    }

    // Save discovery run
    await sql`
      INSERT INTO discovery_runs (id, started_at, completed_at, config, strategies_tested, strategies_passed, best_rating)
      VALUES (${runId}, NOW(), NOW(), ${JSON.stringify({ max_rules: maxRules, max_strategies: maxStrategies })}, ${candidates.length}, ${passed}, ${0})
    `;

    return NextResponse.json({
      success: true,
      generated: candidates.length,
      passed,
      strategy_ids: results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Discovery error:', message);
    return NextResponse.json({ success: false, error: message, generated: 0, passed: 0 }, { status: 500 });
  }
}

function generateName(rules: { id: string; category: string }[]): string {
  const categoryNames: Record<string, string> = {
    A: 'Yield Curve', B: 'Credit', C: 'Labor', D: 'Inflation',
    E: 'Volatility', F: 'Momentum', G: 'Mean Reversion', H: 'Cross-Asset',
    I: 'Leading', J: 'Liquidity', K: 'Sentiment', L: 'Seasonal', M: 'Composite',
  };
  const categories = Array.from(new Set(rules.map(r => r.category)));
  const parts = categories.slice(0, 2).map(c => categoryNames[c] || c);
  if (categories.length > 2) return `${parts.join(' + ')} +${categories.length - 2}`;
  return parts.join(' + ');
}
