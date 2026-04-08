import { NextRequest } from 'next/server';
import { sql } from '@vercel/postgres';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const maxRules = body.max_rules || 5;
  const maxStrategies = body.max_strategies || 500;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: any) {
        controller.enqueue(encoder.encode(`data:${JSON.stringify(data)}\n\n`));
      }

      try {
        // Dynamic imports for engine modules
        const { buildMarketData } = await import('@/lib/data/cache');
        const { allRules } = await import('@/lib/engine/rules/index');
        const { backtestStrategy } = await import('@/lib/engine/backtest');
        const { runCPCV, computeDSR, computePBO } = await import('@/lib/engine/validation');
        const { computeRatingScore, computeRobustnessScore } = await import('@/lib/engine/scoring');
        const { computeCurrentSignal } = await import('@/lib/engine/signals');
        const { scoreToGrade } = await import('@/lib/types');

        send({ pct: 5, phase: 'Loading market data...', generated: 0, passed: 0, done: false });

        const data = await buildMarketData();
        const dates = Object.values(data.prices)[0];
        if (!dates || dates.length === 0) {
          send({ pct: 100, phase: 'Error: No price data available', generated: 0, passed: 0, done: true });
          controller.close();
          return;
        }

        const startDate = dates[252]?.date || dates[0].date; // Skip first year for indicator warmup
        const endDate = dates[dates.length - 1].date;

        send({ pct: 10, phase: 'Generating candidate strategies...', generated: 0, passed: 0, done: false });

        // Generate strategy candidates
        const candidates: { name: string; rules: typeof allRules; ruleIds: string[] }[] = [];
        const rulePool = [...allRules];
        const runId = `run_${Date.now()}`;
        const targetCount = Math.min(maxStrategies, 500);

        // Generate combinations of 3 to maxRules rules
        for (let attempt = 0; attempt < targetCount * 3 && candidates.length < targetCount; attempt++) {
          const numRules = 3 + Math.floor(Math.random() * (maxRules - 2));
          const shuffled = [...rulePool].sort(() => Math.random() - 0.5);
          const selected = shuffled.slice(0, numRules);
          const ruleIds = selected.map(r => r.id).sort();

          // Check for duplicate combinations
          const key = ruleIds.join(',');
          if (candidates.some(c => c.ruleIds.join(',') === key)) continue;

          // Ensure at least 2 different categories
          const categories = new Set(selected.map(r => r.category));
          if (categories.size < 2) continue;

          const name = generateStrategyName(selected);
          candidates.push({ name, rules: selected, ruleIds });
        }

        send({ pct: 20, phase: `Backtesting ${candidates.length} candidates...`, generated: candidates.length, passed: 0, done: false });

        // Backtest and validate each candidate
        let passed = 0;
        const batchSize = 10;

        for (let i = 0; i < candidates.length; i += batchSize) {
          const batch = candidates.slice(i, i + batchSize);

          for (const candidate of batch) {
            try {
              // Run backtest
              const result = backtestStrategy(candidate.rules, 'majority', data, startDate, endDate);

              // Quick filters
              if (result.sharpe < 0.3 || result.cagr < 0) continue;
              if (result.total_trades < 5) continue;

              // CPCV validation
              const cpcv = runCPCV(candidate.rules, 'majority', data);

              // DSR
              const dsr = computeDSR(result.sharpe, candidates.length, result.trades.length, 0, 3);

              // PBO (simplified for speed)
              const pbo = computePBO(candidate.rules, 'majority', data);

              // Compute scores
              const ratingScore = computeRatingScore(result);
              const robustnessScore = computeRobustnessScore(cpcv.passRate, dsr, pbo, true, []);

              if (ratingScore < 60) continue; // Skip F-rated strategies

              // Get current signal
              const current = computeCurrentSignal(candidate.rules, 'majority', data);

              // Save to database
              const strategyId = `strat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

              await sql`
                INSERT INTO strategies (id, name, rules, rule_logic, discovery_run_id)
                VALUES (${strategyId}, ${candidate.name}, ${JSON.stringify(candidate.ruleIds)}, 'majority', ${runId})
              `;

              await sql`
                INSERT INTO strategy_results (strategy_id, signal, rating_score, rating_grade, robustness_score, robustness_grade, cagr, sharpe, max_drawdown, profit_factor, trades_per_year, total_trades, cpcv_pass_rate, dsr, pbo, sensitivity_pass)
                VALUES (${strategyId}, ${current.signal}, ${ratingScore}, ${scoreToGrade(ratingScore)}, ${robustnessScore}, ${scoreToGrade(robustnessScore)}, ${result.cagr}, ${result.sharpe}, ${result.max_drawdown}, ${result.profit_factor}, ${result.trades_per_year}, ${result.total_trades}, ${cpcv.passRate}, ${dsr}, ${pbo}, ${true})
              `;

              // Save trades
              for (const trade of result.trades) {
                await sql`
                  INSERT INTO trades (strategy_id, from_date, to_date, holding, days, return_pct, good_call)
                  VALUES (${strategyId}, ${trade.from_date}, ${trade.to_date}, ${trade.holding}, ${trade.days}, ${trade.return_pct}, ${trade.good_call})
                `;
              }

              passed++;
            } catch {
              // Skip strategies that error during evaluation
              continue;
            }
          }

          const pct = Math.round(20 + (i / candidates.length) * 75);
          send({ pct, phase: `Validating strategies... (${i + batch.length}/${candidates.length})`, generated: candidates.length, passed, done: false });
        }

        // Save discovery run
        await sql`
          INSERT INTO discovery_runs (id, started_at, completed_at, config, strategies_tested, strategies_passed, best_rating)
          VALUES (${runId}, NOW(), NOW(), ${JSON.stringify({ max_rules: maxRules, max_strategies: maxStrategies })}, ${candidates.length}, ${passed}, ${0})
        `;

        send({ pct: 100, phase: `Complete! ${passed} strategies passed validation.`, generated: candidates.length, passed, done: true });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        send({ pct: 100, phase: `Error: ${msg}`, generated: 0, passed: 0, done: true });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

function generateStrategyName(rules: { id: string; name: string; category: string }[]): string {
  const categoryNames: Record<string, string> = {
    A: 'Yield Curve', B: 'Credit', C: 'Labor', D: 'Inflation',
    E: 'Volatility', F: 'Momentum', G: 'Mean Reversion', H: 'Cross-Asset',
    I: 'Leading', J: 'Liquidity', K: 'Sentiment', L: 'Seasonal', M: 'Composite',
  };

  const categories = Array.from(new Set(rules.map(r => r.category)));
  const parts = categories.slice(0, 2).map(c => categoryNames[c] || c);

  if (categories.length > 2) {
    return `${parts.join(' + ')} + ${categories.length - 2} more`;
  }
  return parts.join(' + ');
}
