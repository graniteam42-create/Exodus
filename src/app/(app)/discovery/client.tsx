'use client';

import { useState, useCallback } from 'react';
import StrategyPoolRow from '@/components/StrategyPoolRow';
import type { Asset } from '@/lib/types';

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

export default function DiscoveryClient({ strategies: initial, dataDate }: Props) {
  const [strategies, setStrategies] = useState(initial);
  const [maxRules, setMaxRules] = useState(5);
  const [maxStrategies, setMaxStrategies] = useState(2000);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ pct: 0, phase: '', generated: 0, passed: 0 });

  // Filters
  const [filterSignal, setFilterSignal] = useState('all');
  const [filterRating, setFilterRating] = useState('any');
  const [filterSharpe, setFilterSharpe] = useState('any');
  const [filterDD, setFilterDD] = useState('any');

  const filtered = strategies.filter(s => {
    if (filterSignal !== 'all' && s.signal !== filterSignal) return false;
    if (filterRating !== 'any') {
      const minScore = filterRating === 'A+' ? 97 : filterRating === 'A' ? 93 : filterRating === 'B+' ? 87 : 83;
      if (s.rating_score < minScore) return false;
    }
    if (filterSharpe !== 'any' && s.sharpe < parseFloat(filterSharpe)) return false;
    if (filterDD !== 'any') {
      const maxDD = parseFloat(filterDD) / 100;
      if (Math.abs(s.max_drawdown) > maxDD) return false;
    }
    return true;
  });

  const savedCount = strategies.filter(s => s.saved).length;

  async function handleToggleSave(strategyId: string) {
    const strategy = strategies.find(s => s.strategy_id === strategyId);
    if (!strategy) return;

    const action = strategy.saved ? 'unsave' : 'save';
    await fetch('/api/strategies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, strategy_id: strategyId }),
    });

    setStrategies(prev => prev.map(s =>
      s.strategy_id === strategyId ? { ...s, saved: !s.saved } : s
    ));
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
    setProgress({ pct: 50, phase: 'Generating and testing strategies...', generated: 0, passed: 0 });
    const startTime = Date.now();

    try {
      const res = await fetch('/api/discovery/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ max_rules: maxRules, max_strategies: maxStrategies }),
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const now = new Date().toLocaleTimeString();

      // Handle non-JSON responses (e.g. Vercel timeout returns HTML)
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        setLastResult({
          type: 'error',
          message: `Server timeout after ${elapsed}s`,
          detail: 'The request took too long. Try a lower Max Strategies value (e.g. 2000) or run multiple times.',
          timestamp: now,
        });
        setProgress({ pct: 0, phase: '', generated: 0, passed: 0 });
        return;
      }

      const result = await res.json();

      if (!res.ok || result.error) {
        setLastResult({
          type: 'error',
          message: `Discovery failed after ${elapsed}s`,
          detail: result.error || 'Unknown error from server',
          timestamp: now,
        });
        setProgress({ pct: 0, phase: '', generated: 0, passed: 0 });
        return;
      }

      setProgress({
        pct: 100,
        phase: `Done! ${result.passed} passed / ${result.generated} tested`,
        generated: result.generated,
        passed: result.passed,
      });

      // Reload pool
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

      const fs = result.filter_stats;
      const filterParts: string[] = [];
      if (fs) {
        if (fs.low_sharpe) filterParts.push(`${fs.low_sharpe} low Sharpe`);
        if (fs.few_trades) filterParts.push(`${fs.few_trades} too few trades`);
        if (fs.negative_cagr) filterParts.push(`${fs.negative_cagr} negative CAGR`);
        if (fs.low_rating) filterParts.push(`${fs.low_rating} low rating`);
        if (fs.backtest_error) filterParts.push(`${fs.backtest_error} errors`);
      }
      const filterDetail = filterParts.length > 0 ? `Rejected: ${filterParts.join(', ')}` : '';
      const earlyNote = result.stopped_early ? ' (stopped early — hit time limit, run again to test more)' : '';
      const serverTime = result.timing?.total_s ? ` · Server: ${result.timing.total_s}s` : '';

      if (result.passed === 0) {
        setLastResult({
          type: 'warning',
          message: `No strategies passed quality filters (${result.generated} tested in ${elapsed}s)${earlyNote}`,
          detail: filterDetail + (filterDetail ? '. ' : '') + 'Try running again — random generation produces different candidates each time.',
          timestamp: now,
        });
      } else {
        setLastResult({
          type: 'success',
          message: `${result.saved_to_db || result.passed} strategies added to pool (${result.generated} tested in ${elapsed}s)${earlyNote}`,
          detail: filterDetail + serverTime,
          timestamp: now,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      setLastResult({
        type: 'error',
        message: `Discovery crashed after ${elapsed}s`,
        detail: msg,
        timestamp: new Date().toLocaleTimeString(),
      });
      setProgress({ pct: 0, phase: '', generated: 0, passed: 0 });
    } finally {
      setRunning(false);
    }
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
            <label>Max Strategies</label>
            <input type="range" min={500} max={5000} step={500} value={maxStrategies} onChange={e => setMaxStrategies(Number(e.target.value))} />
            <div className="config-value">{maxStrategies}</div>
          </div>
          <div className="config-item" style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn btn-green" onClick={runDiscovery} disabled={running}>
              {running ? 'Running...' : 'Run Discovery'}
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
              <div className="progress-bar" style={{ width: `${progress.pct}%` }} />
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

      {/* Filters */}
      <div className="filter-bar">
        <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>Filter:</span>
        <select value={filterSignal} onChange={e => setFilterSignal(e.target.value)}>
          <option value="all">Signal: All</option>
          <option value="GLD">GLD</option>
          <option value="SLV">SLV</option>
          <option value="QQQ">QQQ</option>
          <option value="Cash">Cash</option>
        </select>
        <select value={filterRating} onChange={e => setFilterRating(e.target.value)}>
          <option value="any">Min Rating: Any</option>
          <option value="A+">A+</option>
          <option value="A">A</option>
          <option value="B+">B+</option>
          <option value="B">B</option>
        </select>
        <select value={filterSharpe} onChange={e => setFilterSharpe(e.target.value)}>
          <option value="any">Min Sharpe: Any</option>
          <option value="1.5">&gt; 1.5</option>
          <option value="1.0">&gt; 1.0</option>
          <option value="0.7">&gt; 0.7</option>
        </select>
        <select value={filterDD} onChange={e => setFilterDD(e.target.value)}>
          <option value="any">Max Drawdown: Any</option>
          <option value="10">&lt; 10%</option>
          <option value="15">&lt; 15%</option>
          <option value="20">&lt; 20%</option>
          <option value="30">&lt; 30%</option>
        </select>
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
                <th>Name</th>
                <th>Signal</th>
                <th>Rating</th>
                <th>Robust</th>
                <th>CAGR</th>
                <th>Sharpe</th>
                <th>Max DD</th>
                <th>Profit F.</th>
                <th>Trades/yr</th>
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
