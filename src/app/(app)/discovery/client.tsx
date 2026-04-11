'use client';

import { useState } from 'react';
import StrategyPoolRow from '@/components/StrategyPoolRow';
import type { Asset, MarketData } from '@/lib/types';
import { allRules } from '@/lib/engine/rules/index';
import { backtestStrategyFast, precomputeSignals } from '@/lib/engine/backtest';
import type { PrecomputedSignals } from '@/lib/engine/backtest';
import { computeRatingScore } from '@/lib/engine/scoring';

interface PoolStrategy {
  strategy_id: string;
  name: string;
  rules: string[];
  signal: Asset;
  rating_score: number;
  rating_grade: string;
  robustness_score: number;
  robustness_grade: string;
  cagr: number;
  sharpe: number;
  max_drawdown: number;
  profit_factor: number;
  trades_per_year: number;
  total_trades: number;
  cpcv_pass_rate: number;
  dsr: number;
  pbo: number;
  sensitivity_pass: boolean;
  saved: boolean;
  [key: string]: any;
}

interface Props {
  strategies: PoolStrategy[];
  dataDate: string;
}

const categoryNames: Record<string, string> = {
  A: 'Yield Curve', B: 'Credit', C: 'Labor', D: 'Inflation',
  E: 'Volatility', F: 'Momentum', G: 'Mean Reversion', H: 'Cross-Asset',
  I: 'Leading', J: 'Liquidity', K: 'Sentiment', L: 'Seasonal', M: 'Composite',
};

function generateName(rules: { id: string; category: string }[]): string {
  const categories = Array.from(new Set(rules.map(r => r.category)));
  const parts = categories.slice(0, 2).map(c => categoryNames[c] || c);
  if (categories.length > 2) return `${parts.join(' + ')} +${categories.length - 2}`;
  return parts.join(' + ');
}

// Module-level caches (persist across runs, cleared on page reload)
let cachedMarketData: MarketData | null = null;
let cachedPrecomputed: PrecomputedSignals | null = null;

export default function DiscoveryClient({ strategies: initial, dataDate }: Props) {
  const [strategies, setStrategies] = useState(initial);
  const [maxRules, setMaxRules] = useState(6);
  const [maxStrategies, setMaxStrategies] = useState(100000);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ pct: 0, phase: '', tested: 0, passed: 0 });

  // Sort & filter
  const [filterSignal, setFilterSignal] = useState('all');
  type SortKey = 'rating_score' | 'robustness_score' | 'cagr' | 'sharpe' | 'max_drawdown' | 'profit_factor' | 'trades_per_year' | 'name' | 'signal';
  const [sortBy, setSortBy] = useState<SortKey>('rating_score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  function handleSort(key: SortKey) {
    if (sortBy === key) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(key);
      setSortDir(key === 'max_drawdown' || key === 'name' || key === 'signal' ? 'asc' : 'desc');
    }
  }

  const filtered = strategies
    .filter(s => filterSignal === 'all' || s.signal === filterSignal)
    .sort((a, b) => {
      let av: any = a[sortBy];
      let bv: any = b[sortBy];
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      av = av ?? 0; bv = bv ?? 0;
      return sortDir === 'asc' ? av - bv : bv - av;
    });

  const savedCount = strategies.filter(s => s.saved).length;

  async function handleToggleSave(strategyId: string) {
    const strategy = strategies.find(s => s.strategy_id === strategyId);
    if (!strategy) return;

    const action = strategy.saved ? 'unsave' : 'save';
    try {
      const res = await fetch('/api/strategies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, strategy_id: strategyId }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error('Save failed:', result);
        alert(`Failed to ${action}: ${result.error || res.statusText}`);
        return;
      }
      console.log(`${action} ${strategyId}: verified=${result.verified}, total_saved=${result.total_saved}`);
      setStrategies(prev => prev.map(s =>
        s.strategy_id === strategyId ? { ...s, saved: !s.saved } : s
      ));
    } catch (err) {
      console.error('Save error:', err);
      alert(`Failed to ${action} strategy: ${err}`);
    }
  }

  const [lastResult, setLastResult] = useState<{
    type: 'success' | 'error' | 'warning';
    message: string;
    detail?: string;
    timestamp: string;
  } | null>(null);

  async function runDiscovery() {
    setRunning(true);
    setLastResult(null);
    const startTime = Date.now();

    try {
      // Phase 1: Load market data (cached after first download)
      let data: MarketData;
      if (cachedMarketData) {
        setProgress({ pct: 8, phase: 'Using cached market data...', tested: 0, passed: 0 });
        data = cachedMarketData;
      } else {
        setProgress({ pct: 5, phase: 'Downloading market data (first run only — may take 15-30s)...', tested: 0, passed: 0 });
        const dataRes = await fetch('/api/data/market');
        if (!dataRes.ok) {
          const errText = await dataRes.text().catch(() => 'Unknown error');
          throw new Error(`Failed to load market data (${dataRes.status}): ${errText.slice(0, 200)}`);
        }
        const contentType = dataRes.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          throw new Error('Market data endpoint timed out. Try again — data may still be loading from the database.');
        }
        data = await dataRes.json();
        if ((data as any).error) {
          throw new Error(`Market data error: ${(data as any).error}`);
        }
        cachedMarketData = data;
        const keys = Object.keys(data.prices || {});
        const fredKeys = Object.keys(data.fred || {});
        setProgress({ pct: 8, phase: `Data loaded: ${keys.length} tickers, ${fredKeys.length} FRED series`, tested: 0, passed: 0 });
        await new Promise(r => setTimeout(r, 500)); // Brief pause to show data stats
      }

      const priceDates = Object.values(data.prices)[0];
      if (!priceDates || priceDates.length < 300) {
        throw new Error('Insufficient price data. Need at least 300 trading days. Refresh data first.');
      }

      const startDate = priceDates[252]?.date || priceDates[0].date;
      const endDate = priceDates[priceDates.length - 1].date;
      const dataLoadTime = Date.now() - startTime;

      // Phase 2: Pre-compute all rule signals (one-time, cached)
      let precomputed: PrecomputedSignals;
      if (cachedPrecomputed) {
        setProgress({ pct: 10, phase: 'Using cached rule signals...', tested: 0, passed: 0 });
        precomputed = cachedPrecomputed;
      } else {
        setProgress({ pct: 10, phase: 'Pre-computing rule signals (first run only)...', tested: 0, passed: 0 });
        await new Promise(r => setTimeout(r, 0)); // Yield for UI

        const precomputeStart = Date.now();
        precomputed = precomputeSignals(allRules, data, startDate, endDate);
        cachedPrecomputed = precomputed;
        const precomputeTime = ((Date.now() - precomputeStart) / 1000).toFixed(1);
        setProgress({ pct: 25, phase: `Rules pre-computed in ${precomputeTime}s. Generating candidates...`, tested: 0, passed: 0 });
        await new Promise(r => setTimeout(r, 0));
      }

      // Phase 3: Generate candidates
      const rulePool = [...allRules];
      // Build a map from rule ID to rule for fast lookup
      const ruleMap = new Map(rulePool.map(r => [r.id, r]));
      const seen = new Set<string>();
      const candidates: { name: string; ruleIds: string[]; ruleAssets: Asset[] }[] = [];

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

        candidates.push({
          name: generateName(selected),
          ruleIds,
          ruleAssets: ruleIds.map(id => ruleMap.get(id)!.asset),
        });
      }

      // Phase 4: Fast backtest using pre-computed signals
      const filterStats = { backtest_error: 0, low_sharpe: 0, few_trades: 0, negative_cagr: 0, low_capture: 0, low_rating: 0 };
      const passedStrategies: {
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
        trades: any[];
      }[] = [];

      const updateInterval = Math.max(1, Math.floor(candidates.length / 200));

      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];

        if (i % updateInterval === 0) {
          const pct = 25 + Math.round((i / candidates.length) * 65);
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
          const rate = i > 0 ? Math.round(i / ((Date.now() - startTime) / 1000)) : 0;
          setProgress({
            pct,
            phase: `Testing ${i.toLocaleString()}/${candidates.length.toLocaleString()} (${elapsed}s, ${rate}/s) — ${passedStrategies.length} passed`,
            tested: i,
            passed: passedStrategies.length,
          });
          await new Promise(r => setTimeout(r, 0));
        }

        try {
          const result = backtestStrategyFast(candidate.ruleIds, candidate.ruleAssets, 'majority', precomputed);

          if (result.sharpe < 0.1) { filterStats.low_sharpe++; continue; }
          if (result.trades_per_year < 6) { filterStats.few_trades++; continue; }
          if (result.cagr < -0.10) { filterStats.negative_cagr++; continue; }

          // Require >= 75% of trades capture the best-returning asset
          const goodCalls = result.trades.filter((t: any) => t.good_call).length;
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

          passedStrategies.push({
            name: candidate.name,
            ruleIds: candidate.ruleIds,
            ratingScore,
            robustnessScore,
            signal: result.final_signal,
            cagr: result.cagr,
            sharpe: result.sharpe,
            max_drawdown: result.max_drawdown,
            profit_factor: result.profit_factor,
            trades_per_year: result.trades_per_year,
            total_trades: result.total_trades,
            win_rate: result.win_rate,
            trades: result.trades?.slice(-20) || [],
          });
        } catch {
          filterStats.backtest_error++;
        }
      }

      // Phase 5: Save TOP strategies to server (sorted by rating, capped at 500)
      const MAX_SAVE = 500;
      passedStrategies.sort((a, b) => b.ratingScore - a.ratingScore);
      const toSave = passedStrategies.slice(0, MAX_SAVE);

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const now = new Date().toLocaleTimeString();

      if (toSave.length > 0) {
        setProgress({
          pct: 92,
          phase: `Saving top ${toSave.length} of ${passedStrategies.length} strategies to database...`,
          tested: candidates.length,
          passed: passedStrategies.length,
        });

        const runId = `run_${Date.now()}`;

        // Save in batches of 100 to avoid request size limits
        const saveBatchSize = 100;
        let totalSaved = 0;

        for (let i = 0; i < toSave.length; i += saveBatchSize) {
          const batch = toSave.slice(i, i + saveBatchSize);
          const saveRes = await fetch('/api/discovery/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ strategies: batch, run_id: runId }),
          });
          const saveResult = await saveRes.json().catch(() => ({}));
          if (saveRes.ok) {
            totalSaved += saveResult.saved || 0;
            console.log(`Save batch ${Math.floor(i / saveBatchSize) + 1}: saved=${saveResult.saved}, db_total=${saveResult.db_total}, top_scores=${JSON.stringify(saveResult.top_scores)}, input_score=${saveResult.sample_input_score}`);
          } else {
            console.error('Save batch failed:', saveResult);
          }
        }

        // Reload pool
        setProgress({
          pct: 97,
          phase: 'Reloading pool...',
          tested: candidates.length,
          passed: passedStrategies.length,
        });

        const poolRes = await fetch('/api/strategies?pool=true');
        if (poolRes.ok) {
          const newStrategies = await poolRes.json();
          setStrategies(newStrategies.map((r: any) => ({
            ...r,
            signal: r.signal || 'Cash',
            rules: r.rules || [],
            saved: r.saved || false,
          })));
        }

        const filterParts: string[] = [];
        if (filterStats.low_sharpe) filterParts.push(`${filterStats.low_sharpe} low Sharpe`);
        if (filterStats.few_trades) filterParts.push(`${filterStats.few_trades} too few trades`);
        if (filterStats.negative_cagr) filterParts.push(`${filterStats.negative_cagr} negative CAGR`);
        if (filterStats.low_capture) filterParts.push(`${filterStats.low_capture} low capture`);
        if (filterStats.low_rating) filterParts.push(`${filterStats.low_rating} low rating`);
        if (filterStats.backtest_error) filterParts.push(`${filterStats.backtest_error} errors`);

        setLastResult({
          type: 'success',
          message: `${totalSaved} best strategies saved to pool (${passedStrategies.length.toLocaleString()} passed / ${candidates.length.toLocaleString()} tested in ${elapsed}s)`,
          detail: (passedStrategies.length > MAX_SAVE ? `Saved top ${MAX_SAVE} by rating. ` : '') + (filterParts.length > 0 ? `Rejected: ${filterParts.join(', ')}` : ''),
          timestamp: now,
        });
      } else {
        const filterParts: string[] = [];
        if (filterStats.low_sharpe) filterParts.push(`${filterStats.low_sharpe} low Sharpe`);
        if (filterStats.few_trades) filterParts.push(`${filterStats.few_trades} too few trades`);
        if (filterStats.negative_cagr) filterParts.push(`${filterStats.negative_cagr} negative CAGR`);
        if (filterStats.low_capture) filterParts.push(`${filterStats.low_capture} low capture`);
        if (filterStats.low_rating) filterParts.push(`${filterStats.low_rating} low rating`);
        if (filterStats.backtest_error) filterParts.push(`${filterStats.backtest_error} errors`);

        setLastResult({
          type: 'warning',
          message: `No strategies passed quality filters (${candidates.length.toLocaleString()} tested in ${elapsed}s)`,
          detail: (filterParts.length > 0 ? `Rejected: ${filterParts.join(', ')}. ` : '') + 'Try running again — random generation produces different candidates each time.',
          timestamp: now,
        });
      }

      setProgress({ pct: 100, phase: 'Done', tested: candidates.length, passed: passedStrategies.length });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      setLastResult({
        type: 'error',
        message: `Discovery failed after ${elapsed}s`,
        detail: msg,
        timestamp: new Date().toLocaleTimeString(),
      });
      setProgress({ pct: 0, phase: '', tested: 0, passed: 0 });
    } finally {
      setRunning(false);
    }
  }

  async function clearPool() {
    if (!confirm('Clear the discovery pool? Your saved strategies will be kept.')) return;

    await fetch('/api/strategies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clear_pool' }),
    });
    cachedPrecomputed = null;
    setStrategies(prev => prev.filter(s => s.saved));
    setLastResult({ type: 'success', message: 'Pool cleared (saved strategies kept). Run Discovery to generate new strategies.', timestamp: new Date().toLocaleTimeString() });
  }

  return (
    <div>
      {/* Strategy Generation */}
      <div className="card" style={{ padding: '14px 18px' }}>
        <div className="card-title" style={{ marginBottom: 12 }}>Strategy Generation</div>
        <div className="discovery-config">
          <div className="config-item">
            <label>Max Rules per Strategy</label>
            <input type="range" min={2} max={6} value={maxRules} onChange={e => setMaxRules(Number(e.target.value))} />
            <div className="config-value">{maxRules}</div>
          </div>
          <div className="config-item">
            <label>Strategies to Test</label>
            <input type="range" min={10000} max={200000} step={10000} value={maxStrategies} onChange={e => setMaxStrategies(Number(e.target.value))} />
            <div className="config-value">{maxStrategies.toLocaleString()}</div>
          </div>
          <div className="config-item" style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <button className="btn btn-green" onClick={runDiscovery} disabled={running}>
              {running ? 'Running...' : 'Run Discovery'}
            </button>
            <button className="btn btn-outline" onClick={clearPool} disabled={running} style={{ fontSize: '0.78rem' }}>
              Clear Pool
            </button>
          </div>
        </div>

        {running && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 6 }}>
              <span>{progress.phase}</span>
              <span className="mono">{progress.pct}%</span>
            </div>
            <div className="progress-container">
              <div className="progress-bar" style={{ width: `${progress.pct}%`, transition: 'width 0.3s ease' }} />
            </div>
            <div style={{ display: 'flex', gap: 20, fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8 }}>
              <span>Tested: <strong className="mono" style={{ color: 'var(--text)' }}>{progress.tested.toLocaleString()}</strong></span>
              <span>Passed: <strong className="mono" style={{ color: 'var(--green-light)' }}>{progress.passed.toLocaleString()}</strong></span>
            </div>
          </div>
        )}

        {/* Persistent result message */}
        {lastResult && !running && (
          <div style={{
            marginTop: 12,
            padding: '12px 16px',
            background: lastResult.type === 'error'
              ? 'rgba(192,57,43,0.08)'
              : lastResult.type === 'warning'
              ? 'rgba(212,128,26,0.08)'
              : 'rgba(39,174,96,0.08)',
            border: `1px solid ${
              lastResult.type === 'error'
                ? 'rgba(192,57,43,0.25)'
                : lastResult.type === 'warning'
                ? 'rgba(212,128,26,0.25)'
                : 'rgba(39,174,96,0.25)'
            }`,
            borderRadius: 6,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{
                fontSize: '0.85rem',
                fontWeight: 600,
                color: lastResult.type === 'error'
                  ? 'var(--red)'
                  : lastResult.type === 'warning'
                  ? 'var(--amber)'
                  : 'var(--green-light)',
              }}>
                {lastResult.type === 'error' ? '\u2717 ' : lastResult.type === 'warning' ? '\u26A0 ' : '\u2713 '}
                {lastResult.message}
              </div>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{lastResult.timestamp}</span>
            </div>
            {lastResult.detail && (
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 6 }}>
                {lastResult.detail}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Signal filter */}
      <div className="filter-bar">
        <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>Signal:</span>
        {['all', 'GLD', 'SLV', 'QQQ', 'Cash'].map(sig => (
          <button key={sig} className={`btn btn-sm ${filterSignal === sig ? 'btn-active' : 'btn-outline'}`}
            style={{ fontSize: '0.75rem', padding: '4px 10px' }}
            onClick={() => setFilterSignal(sig)}>
            {sig === 'all' ? 'All' : sig}
          </button>
        ))}
      </div>

      {/* Pool freshness */}
      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 12 }}>
        Pool based on data through {dataDate} &middot;{' '}
        <span className="mono" style={{ color: 'var(--text)' }}>{filtered.length}</span> strategies
        {filtered.length !== strategies.length && ` (${strategies.length} total)`}
        {' \u00B7 '}
        <span className="mono" style={{ color: 'var(--green-light)' }}>{savedCount}</span> saved
      </div>

      {/* Strategy Pool Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th style={{ width: 36 }}></th>
                {([
                  ['name', 'Name'],
                  ['signal', 'Signal'],
                  ['rating_score', 'Rating'],
                  ['robustness_score', 'Robust'],
                  ['cagr', 'CAGR'],
                  ['sharpe', 'Sharpe'],
                  ['max_drawdown', 'Max DD'],
                  ['profit_factor', 'Win/Loss'],
                  ['trades_per_year', 'Trades/yr'],
                ] as [SortKey, string][]).map(([key, label]) => (
                  <th key={key}
                    onClick={() => handleSort(key)}
                    style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                    {label}
                    {sortBy === key && (
                      <span style={{ marginLeft: 4, fontSize: '0.7em', opacity: 0.7 }}>
                        {sortDir === 'desc' ? '\u25BC' : '\u25B2'}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <StrategyPoolRow
                  key={s.strategy_id}
                  strategy={s}
                  onToggleSave={handleToggleSave}
                />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                    {strategies.length === 0
                      ? 'No strategies in pool. Click "Run Discovery" to generate strategies.'
                      : 'No strategies match current filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
