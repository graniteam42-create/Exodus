import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export const maxDuration = 60;

// Time budget: 55s total (leave 5s buffer for Vercel's 60s limit)
const TIME_BUDGET_MS = 55_000;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const maxRules = body.max_rules || 5;
  const maxStrategies = body.max_strategies || 2000;
  const startTime = Date.now();

  try {
    // Dynamic imports
    const { buildMarketData } = await import('@/lib/data/cache');
    const { allRules } = await import('@/lib/engine/rules/index');
    const { backtestStrategy } = await import('@/lib/engine/backtest');
    const { computeRatingScore } = await import('@/lib/engine/scoring');
    const { computeCurrentSignal } = await import('@/lib/engine/signals');
    const { scoreToGrade } = await import('@/lib/types');

    const data = await buildMarketData();
    const dataLoadTime = Date.now() - startTime;

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

    // --- Phase 1: Generate unique candidate rule combos ---
    const candidates: { name: string; rules: typeof allRules; ruleIds: string[] }[] = [];
    const seen = new Set<string>();

    for (let attempt = 0; attempt < maxStrategies * 4 && candidates.length < maxStrategies; attempt++) {
      const numRules = 3 + Math.floor(Math.random() * (maxRules - 2));
      const shuffled = [...rulePool].sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, numRules);
      const ruleIds = selected.map(r => r.id).sort();
      const key = ruleIds.join(',');

      if (seen.has(key)) continue;
      seen.add(key);

      const cats = new Set(selected.map(r => r.category));
      if (cats.size < 2) continue;

      candidates.push({ name: generateName(selected), rules: selected, ruleIds });
    }

    // --- Phase 2: Backtest candidates with time budget ---
    const filterStats = { backtest_error: 0, low_sharpe: 0, few_trades: 0, negative_cagr: 0, low_capture: 0, low_rating: 0 };
    const passedStrategies: {
      name: string;
      ruleIds: string[];
      ratingScore: number;
      robustnessScore: number;
      signal: string;
      result: any;
    }[] = [];

    let tested = 0;
    let stoppedEarly = false;

    for (const candidate of candidates) {
      // Check time budget — leave 10s for DB writes
      if (Date.now() - startTime > TIME_BUDGET_MS - 10_000) {
        stoppedEarly = true;
        break;
      }

      tested++;

      try {
        const result = backtestStrategy(candidate.rules, 'majority', data, startDate, endDate);

        if (result.sharpe < 0.1) { filterStats.low_sharpe++; continue; }
        if (result.trades_per_year < 6) { filterStats.few_trades++; continue; }
        if (result.cagr < -0.10) { filterStats.negative_cagr++; continue; }

        // Require >= 75% of trades capture the best-returning asset
        const goodCalls = result.trades.filter(t => t.good_call).length;
        const captureRate = result.trades.length > 0 ? goodCalls / result.trades.length : 0;
        if (captureRate < 0.75) { filterStats.low_capture++; continue; }

        const ratingScore = computeRatingScore(result);
        if (ratingScore < 40) { filterStats.low_rating++; continue; }

        const robustnessScore = Math.min(100, Math.max(0,
          (result.profit_factor > 1 ? 30 : 0) +
          (result.sharpe > 0.5 ? 20 : result.sharpe > 0.3 ? 10 : 0) +
          (result.total_trades > 10 ? 15 : result.total_trades > 5 ? 10 : 5) +
          (Math.abs(result.max_drawdown) < 0.2 ? 20 : Math.abs(result.max_drawdown) < 0.3 ? 10 : 0) +
          (result.win_rate > 0.55 ? 15 : result.win_rate > 0.45 ? 10 : 5)
        ));

        const current = computeCurrentSignal(candidate.rules, 'majority', data);

        passedStrategies.push({
          name: candidate.name,
          ruleIds: candidate.ruleIds,
          ratingScore,
          robustnessScore,
          signal: current.signal,
          result,
        });
      } catch {
        filterStats.backtest_error++;
      }
    }

    // --- Phase 3: Batch-insert passing strategies into DB ---
    const strategyIds: string[] = [];

    if (passedStrategies.length > 0) {
      const batchSize = 50;
      for (let i = 0; i < passedStrategies.length; i += batchSize) {
        // Check time budget before each DB batch
        if (Date.now() - startTime > TIME_BUDGET_MS) break;

        const batch = passedStrategies.slice(i, i + batchSize);
        const ids = batch.map(() => `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
        strategyIds.push(...ids);

        const stratValues = batch.map((s, j) =>
          `('${ids[j]}', '${s.name.replace(/'/g, "''")}', '${JSON.stringify(s.ruleIds).replace(/'/g, "''")}', 'majority', '${runId}')`
        ).join(',');
        await sql.query(
          `INSERT INTO strategies (id, name, rules, rule_logic, discovery_run_id) VALUES ${stratValues}`
        );

        const resValues = batch.map((s, j) =>
          `('${ids[j]}', '${s.signal}', ${s.ratingScore}, '${scoreToGrade(s.ratingScore)}', ${s.robustnessScore}, '${scoreToGrade(s.robustnessScore)}', ${s.result.cagr}, ${s.result.sharpe}, ${s.result.max_drawdown}, ${s.result.profit_factor}, ${s.result.trades_per_year}, ${s.result.total_trades}, 0, 0, 0, true)`
        ).join(',');
        await sql.query(
          `INSERT INTO strategy_results (strategy_id, signal, rating_score, rating_grade, robustness_score, robustness_grade, cagr, sharpe, max_drawdown, profit_factor, trades_per_year, total_trades, cpcv_pass_rate, dsr, pbo, sensitivity_pass) VALUES ${resValues}`
        );

        // Batch insert last 20 trades per strategy
        const tradeRows: string[] = [];
        for (let j = 0; j < batch.length; j++) {
          const trades = batch[j].result.trades || [];
          for (const t of trades) {
            tradeRows.push(
              `('${ids[j]}', '${t.from_date}', '${t.to_date}', '${t.holding}', ${t.days}, ${t.return_pct}, ${t.good_call})`
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
    }

    // Save discovery run
    await sql`
      INSERT INTO discovery_runs (id, started_at, completed_at, config, strategies_tested, strategies_passed, best_rating)
      VALUES (${runId}, NOW(), NOW(), ${JSON.stringify({ max_rules: maxRules, max_strategies: maxStrategies })}, ${tested}, ${passedStrategies.length}, ${0})
    `;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    return NextResponse.json({
      success: true,
      generated: tested,
      candidates_created: candidates.length,
      passed: passedStrategies.length,
      saved_to_db: strategyIds.length,
      strategy_ids: strategyIds,
      filter_stats: filterStats,
      stopped_early: stoppedEarly,
      timing: {
        data_load_ms: dataLoadTime,
        total_s: elapsed,
      },
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
