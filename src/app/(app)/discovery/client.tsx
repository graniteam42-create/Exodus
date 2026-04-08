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
  const [maxStrategies, setMaxStrategies] = useState(500);
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

  async function runDiscovery() {
    setRunning(true);
    setProgress({ pct: 0, phase: 'Starting...', generated: 0, passed: 0 });

    try {
      const res = await fetch('/api/discovery/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ max_rules: maxRules, max_strategies: maxStrategies }),
      });

      if (!res.ok) throw new Error('Discovery failed');

      // Stream progress
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value);
          const lines = text.split('\n').filter(l => l.startsWith('data:'));
          for (const line of lines) {
            try {
              const data = JSON.parse(line.slice(5));
              setProgress(data);
              if (data.done) {
                // Reload strategies
                const poolRes = await fetch('/api/strategies?pool=true');
                if (poolRes.ok) {
                  const newStrategies = await poolRes.json();
                  setStrategies(newStrategies);
                }
              }
            } catch { /* ignore parse errors */ }
          }
        }
      }
    } catch (err) {
      console.error('Discovery error:', err);
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
            <input type="range" min={50} max={500} step={50} value={maxStrategies} onChange={e => setMaxStrategies(Number(e.target.value))} />
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
            <div style={{ display: 'flex', gap: 20, fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8 }}>
              <span>Generated: <strong className="mono" style={{ color: 'var(--text)' }}>{progress.generated}</strong></span>
              <span>Passed: <strong className="mono" style={{ color: 'var(--green-light)' }}>{progress.passed}</strong></span>
            </div>
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
