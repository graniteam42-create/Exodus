'use client';

import { useState } from 'react';
import type { Asset, ConsensusResult, RegimeScore, DataSourceHealth } from '@/lib/types';
import { scoreToGrade, gradeColor } from '@/lib/types';
import DataHealthBar from '@/components/DataHealthBar';
import AllocationBar from '@/components/AllocationBar';
import SignalBadge from '@/components/SignalBadge';
import RegimeAssessment from '@/components/RegimeAssessment';
import CollapsibleSection from '@/components/CollapsibleSection';

const assetColor: Record<string, string> = { GLD: '#B8860B', SLV: '#8A8A8A', QQQ: '#2C5F82', Cash: '#444C56' };

interface Props {
  dataHealth: { date: string; sources: DataSourceHealth[] };
  consensus: ConsensusResult | null;
  agreements: { name: string; signal: Asset; rating: number; robustness: number }[];
  regimeScores: RegimeScore[];
  indicatorAlerts: { level: string; title: string; detail: string; indicatorId: string }[];
}

export default function RadarClient({ dataHealth, consensus, agreements, regimeScores, indicatorAlerts }: Props) {
  const [refreshing, setRefreshing] = useState(false);

  const [refreshStatus, setRefreshStatus] = useState('');

  async function handleRefresh() {
    setRefreshing(true);
    try {
      // Try fast parallel refresh first (works when data already exists)
      setRefreshStatus('Refreshing all data...');
      const res = await fetch('/api/data/refresh', { method: 'POST' });
      const result = await res.json();

      if (res.ok && !result.errors?.length) {
        setRefreshStatus('Done! Reloading...');
        window.location.reload();
        return;
      }

      // If fast refresh failed (likely first load), fall back to one-by-one
      setRefreshStatus('First load detected — fetching series individually...');
      await fetch('/api/data/init', { method: 'POST' });

      const series = [
        'T10Y2Y','T10Y3M','DFII10','T10YIE','BAMLH0A0HYM2','M2SL','SAHMREALTIME',
        'UMCSENT','NFCI','DRTSCILM','WALCL','RRPONTSYD','VIXCLS','ICSA','CCSA',
        'UNRATE','CPIAUCSL','CPILFESL','FEDFUNDS','DGS10','DGS2','DGS3MO','RECPROUSM156N'
      ];
      const tickers = ['GLD.US','SLV.US','QQQ.US','UUP.US','COPX.US','SPY.US'];

      for (let i = 0; i < series.length; i++) {
        setRefreshStatus(`Fetching FRED ${i+1}/${series.length}: ${series[i]}...`);
        await fetch(`/api/data/refresh?type=fred&id=${series[i]}`, { method: 'POST' });
      }
      for (let i = 0; i < tickers.length; i++) {
        setRefreshStatus(`Fetching EODHD ${i+1}/${tickers.length}: ${tickers[i]}...`);
        await fetch(`/api/data/refresh?type=eodhd&id=${tickers[i]}`, { method: 'POST' });
      }

      setRefreshStatus('Done! Reloading...');
      window.location.reload();
    } catch {
      alert('Data refresh failed');
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div>
      {/* Data Health Bar */}
      <DataHealthBar sources={dataHealth.sources} dataDate={dataHealth.date} />

      {/* Refresh Button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        {refreshing && refreshStatus && (
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{refreshStatus}</span>
        )}
        <button className="btn btn-outline" onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? 'Refreshing...' : 'Refresh Data'}
        </button>
      </div>

      {/* No data state */}
      {!consensus && (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <h2 style={{ marginBottom: 8 }}>Welcome to Exodus</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>
            No strategies found. Start by refreshing data, then go to Discovery to generate and save strategies.
          </p>
          <button className="btn btn-primary" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? 'Fetching data...' : 'Fetch Data from FRED & EODHD'}
          </button>
        </div>
      )}

      {/* Consensus */}
      {consensus && (
        <div className="card">
          <div className="card-title">Consensus Recommendation</div>

          {/* Current Position */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <div style={{ background: assetColor[consensus.current_position], color: 'white', padding: '16px 24px', borderRadius: 8, fontSize: '1.3rem', fontWeight: 700 }}>
              {consensus.current_position}
            </div>
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Current Position</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Based on top-rated strategy: <strong>{consensus.current_strategy_name}</strong>{' '}
                (Rating {scoreToGrade(consensus.current_strategy_rating)} {Math.round(consensus.current_strategy_rating)},
                Robust {scoreToGrade(consensus.current_strategy_robustness)} {Math.round(consensus.current_strategy_robustness)})
              </div>
            </div>
          </div>

          {/* Weighted Consensus */}
          <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 }}>
            Weighted Consensus
            <span title="Each saved strategy votes for an asset. Vote weight = Rating score. Higher-rated strategies have more influence."
              style={{ marginLeft: 4, cursor: 'help', opacity: 0.7 }}>[?]</span>
          </div>
          <AllocationBar
            allocation={consensus.weighted_allocation}
            breakdown={consensus.allocation_breakdown}
          />
        </div>
      )}

      {/* Indicator Alerts */}
      {indicatorAlerts.length > 0 && (
        <div className="card">
          <div className="card-title">Indicator Alerts</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {indicatorAlerts.slice(0, 5).map((alert, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                background: alert.level === 'critical' ? 'rgba(192,57,43,0.06)' : 'rgba(212,128,26,0.06)',
                border: `1px solid ${alert.level === 'critical' ? 'rgba(192,57,43,0.15)' : 'rgba(212,128,26,0.15)'}`,
                borderRadius: 6,
              }}>
                <span style={{ color: alert.level === 'critical' ? 'var(--red)' : 'var(--amber)', fontSize: '1rem' }}>
                  {alert.level === 'critical' ? '\u25BC' : '\u25B2'}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{alert.title}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{alert.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Regime Assessment */}
      {regimeScores.length > 0 && <RegimeAssessment phases={regimeScores} />}

      {/* Strategy Agreement */}
      {agreements.length > 0 && consensus && (
        <div className="card">
          <div className="card-title">Strategy Agreement</div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 12 }}>
            <span className="mono" style={{ color: 'var(--text)', fontWeight: 600 }}>
              {Math.round(consensus.agreement_pct)}%
            </span>{' '}
            weighted agreement with consensus ({consensus.current_position}).
          </p>

          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>Strategy</th><th>Signal</th><th>Rating</th><th>Weight</th><th>Agrees</th></tr>
              </thead>
              <tbody>
                {agreements.map((s, i) => {
                  const totalWeight = agreements.reduce((sum, a) => sum + a.rating, 0);
                  const weight = totalWeight > 0 ? (s.rating / totalWeight) * 100 : 0;
                  const agrees = s.signal === consensus.current_position;
                  const consensusAsset = (Object.entries(consensus.weighted_allocation) as [Asset, number][])
                    .sort((a, b) => b[1] - a[1])[0][0];

                  return (
                    <tr key={i} style={!agrees ? { background: 'rgba(192,57,43,0.06)' } : undefined}>
                      <td>
                        {s.name}
                        {!agrees && s.rating > 85 && (
                          <span className="badge badge-red" style={{ marginLeft: 6, fontSize: '0.6rem' }}>Diverges</span>
                        )}
                      </td>
                      <td><SignalBadge asset={s.signal} /></td>
                      <td>
                        <span className="mono" style={{ color: gradeColor(scoreToGrade(s.rating)), fontWeight: 600 }}>
                          {scoreToGrade(s.rating)} ({Math.round(s.rating)})
                        </span>
                      </td>
                      <td className="mono">{Math.round(weight)}%</td>
                      <td style={{ color: agrees ? 'var(--green-light)' : 'var(--red)', fontWeight: 600 }}>
                        {agrees ? '\u2713 Yes' : `\u2717 No \u2014 ${s.signal}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Divergence warning */}
          {agreements.some(s => s.signal !== consensus.current_position && s.rating > 85) && (
            <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(192,57,43,0.06)', border: '1px solid rgba(192,57,43,0.2)', borderRadius: 6, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <strong style={{ color: 'var(--red)' }}>&#9888; Divergence warning:</strong>{' '}
              {agreements.filter(s => s.signal !== consensus.current_position && s.rating > 85).map(s => s.name).join(', ')}{' '}
              disagree{agreements.filter(s => s.signal !== consensus.current_position && s.rating > 85).length > 1 ? '' : 's'} with consensus. High-rated strategies with different signals deserve attention.
            </div>
          )}
        </div>
      )}

      {/* How to Read This */}
      <CollapsibleSection title="How to Read This Dashboard">
        <p><strong>Current Position</strong> shows what you should be invested in NOW, based on your top-rated saved strategy. The <strong>Weighted Consensus</strong> shows the allocation across all saved strategies, where each strategy&apos;s vote is weighted by its Rating score.</p>
        <p style={{ marginTop: 8 }}><strong>Indicator Alerts</strong> highlight indicators that recently changed direction or crossed important thresholds. Click to see details on the Indicators tab.</p>
        <p style={{ marginTop: 8 }}><strong>Regime Assessment</strong> is NOT a trading signal. It&apos;s a &quot;weather forecast&quot; — it scores current conditions against historical crisis patterns to give context.</p>
        <p style={{ marginTop: 8 }}><strong>Strategy Agreement</strong> shows whether your saved strategies agree on direction. Higher agreement = higher conviction. Divergence warnings flag high-rated strategies that disagree.</p>
      </CollapsibleSection>
    </div>
  );
}
