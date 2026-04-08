'use client';

import type { StrategyResult, Asset, TradeRecord, PeriodBreakdown, LiveTrackRecord } from '@/lib/types';
import { scoreToGrade, gradeColor } from '@/lib/types';
import SignalBadge from './SignalBadge';
import GradeBadge from './GradeBadge';
import CollapsibleSection from './CollapsibleSection';

interface StrategyCardProps {
  strategy: StrategyResult & {
    name: string;
    rules: string[];
    activeRules?: { id: string; active: boolean; value?: string }[];
    trades?: TradeRecord[];
    periods?: PeriodBreakdown[];
    liveTrack?: LiveTrackRecord;
  };
  onUnsave?: (id: string) => void;
}

const assetColor: Record<string, string> = {
  GLD: '#B8860B', SLV: '#8A8A8A', QQQ: '#2C5F82', Cash: '#444C56',
};

export default function StrategyCard({ strategy, onUnsave }: StrategyCardProps) {
  const ratingGrade = scoreToGrade(strategy.rating_score);
  const robustGrade = scoreToGrade(strategy.robustness_score);
  const ratingClass = ratingGrade.startsWith('A') ? 'grade-a' : ratingGrade.startsWith('B') ? 'grade-b' : ratingGrade.startsWith('C') ? 'grade-c' : 'grade-d';
  const robustClass = robustGrade.startsWith('A') ? 'grade-a' : robustGrade.startsWith('B') ? 'grade-b' : robustGrade.startsWith('C') ? 'grade-c' : 'grade-d';

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="detail-inner" style={{ background: 'var(--card)' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>{strategy.name}</div>
            <span className={`badge badge-${ratingGrade.startsWith('A') ? 'green' : ratingGrade.startsWith('B') ? 'amber' : 'orange'}`}>
              Rating {ratingGrade} ({Math.round(strategy.rating_score)}) &middot; Robust {robustGrade} ({Math.round(strategy.robustness_score)})
            </span>
          </div>
          {onUnsave && (
            <button
              className="btn btn-outline"
              style={{ fontSize: '0.78rem', padding: '4px 12px' }}
              onClick={() => onUnsave(strategy.strategy_id)}
            >
              &#9829; Unsave
            </button>
          )}
        </div>

        {/* KPI Row */}
        <div className="detail-top">
          <div className="detail-signal-badge" style={{ background: assetColor[strategy.signal] || '#444' }}>
            {strategy.signal}
          </div>
          <div className="detail-kpis">
            <KpiItem label="CAGR" value={`${strategy.cagr > 0 ? '+' : ''}${(strategy.cagr * 100).toFixed(1)}%`} />
            <KpiItem label="Sharpe" value={strategy.sharpe.toFixed(2)} />
            <KpiItem label="Max DD" value={`${(strategy.max_drawdown * 100).toFixed(1)}%`} />
            <KpiItem label="Win/Loss" value={strategy.profit_factor.toFixed(2)} />
            <KpiItem label="Trades/yr" value={strategy.trades_per_year.toFixed(1)} />
          </div>
          <div className="detail-grades">
            <div className={`grade-box ${ratingClass}`}>{ratingGrade}<div className="grade-label">Rating</div></div>
            <div className={`grade-box ${robustClass}`}>{robustGrade}<div className="grade-label">Robust</div></div>
          </div>
        </div>

        {/* Strategy Rules */}
        <CollapsibleSection title={`Strategy Rules (${strategy.rules.length})`}>
          <div>
            {strategy.activeRules ? strategy.activeRules.map(rule => (
              <div key={rule.id} className="rule-item">
                <span className={`rule-status ${rule.active ? 'rule-active' : 'rule-inactive'}`}>
                  {rule.active ? 'Active' : 'Inactive'}
                </span>
                <span>
                  <strong>{rule.id}</strong>
                  {rule.value && <span className="mono" style={{ marginLeft: 8, color: 'var(--text-muted)' }}>{rule.value}</span>}
                </span>
              </div>
            )) : strategy.rules.map(ruleId => (
              <div key={ruleId} className="rule-item">
                <span className="rule-status rule-active">Rule</span>
                <span><strong>{ruleId}</strong></span>
              </div>
            ))}
          </div>
        </CollapsibleSection>

        {/* Robustness Check */}
        <CollapsibleSection title="Robustness Check">
          <div style={{ marginBottom: 8 }}>
            <strong>Robustness: </strong>
            <span className={`grade-inline ${robustClass}`}>{robustGrade}</span>
            <span className="mono" style={{ marginLeft: 6 }}>CPCV {Math.round(strategy.cpcv_pass_rate * 28)}/28</span>
            {' \u00B7 '}
            <span className="mono">DSR {strategy.dsr.toFixed(2)}</span>
            {' \u00B7 '}
            <span className="mono">PBO {strategy.pbo.toFixed(2)}</span>
            {' \u00B7 '}
            Sensitivity: {strategy.sensitivity_pass ? 'Pass' : 'Fail'}
          </div>
          {strategy.periods && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr><th>Period</th><th>Strategy</th><th>GLD</th><th>SLV</th><th>QQQ</th><th>Sharpe</th><th>Max DD</th></tr>
                </thead>
                <tbody>
                  {strategy.periods.map(p => (
                    <tr key={p.period}>
                      <td>{p.period}</td>
                      <td className="mono" style={{ color: p.strategy_return > 0 ? 'var(--green-light)' : 'var(--red)' }}>
                        {p.strategy_return > 0 ? '+' : ''}{(p.strategy_return * 100).toFixed(1)}%
                      </td>
                      <td className="mono">{(p.gld_return * 100).toFixed(1)}%</td>
                      <td className="mono">{(p.slv_return * 100).toFixed(1)}%</td>
                      <td className="mono">{(p.qqq_return * 100).toFixed(1)}%</td>
                      <td className="mono">{p.sharpe.toFixed(2)}</td>
                      <td className="mono" style={{ color: 'var(--red)' }}>{(p.max_dd * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CollapsibleSection>

        {/* Trade Log */}
        {strategy.trades && (
          <CollapsibleSection title={`Trade Log (${strategy.trades.length} trades)`}>
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              <table>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--card)' }}>
                  <tr><th>From</th><th>To</th><th>Holding</th><th>Days</th><th>Return</th><th>Good Call?</th></tr>
                </thead>
                <tbody>
                  {strategy.trades.map((t, i) => (
                    <tr key={i}>
                      <td className="mono">{t.from_date}</td>
                      <td className="mono">{t.to_date || 'present'}</td>
                      <td><SignalBadge asset={t.holding} /></td>
                      <td className="mono">{t.days}</td>
                      <td className="mono" style={{ color: t.return_pct > 0 ? 'var(--green-light)' : t.return_pct < 0 ? 'var(--red)' : 'var(--text-muted)' }}>
                        {t.return_pct > 0 ? '+' : ''}{(t.return_pct * 100).toFixed(1)}%
                      </td>
                      <td style={{ color: t.good_call ? 'var(--green-light)' : 'var(--red)', fontWeight: 600 }}>
                        {t.good_call ? 'YES' : 'NO'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CollapsibleSection>
        )}

        {/* Live Track Record */}
        {strategy.liveTrack && (
          <CollapsibleSection title="Live Track Record">
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 10 }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Saved: <strong className="mono" style={{ color: 'var(--text)' }}>{strategy.liveTrack.saved_at}</strong>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Live days: <strong className="mono" style={{ color: 'var(--text)' }}>{strategy.liveTrack.live_days} trading days</strong>
              </div>
              <div>
                <TrustBadge level={strategy.liveTrack.trust_level} />
              </div>
            </div>
            <table>
              <thead><tr><th>Period</th><th>Strategy</th><th>GLD</th><th>SLV</th><th>QQQ</th><th>Cash</th></tr></thead>
              <tbody>
                <tr>
                  <td>Since saved</td>
                  <td className="mono" style={{ color: strategy.liveTrack.strategy_return > 0 ? 'var(--green-light)' : 'var(--red)', fontWeight: 600 }}>
                    {strategy.liveTrack.strategy_return > 0 ? '+' : ''}{(strategy.liveTrack.strategy_return * 100).toFixed(1)}%
                  </td>
                  <td className="mono">{(strategy.liveTrack.gld_return * 100).toFixed(1)}%</td>
                  <td className="mono">{(strategy.liveTrack.slv_return * 100).toFixed(1)}%</td>
                  <td className="mono">{(strategy.liveTrack.qqq_return * 100).toFixed(1)}%</td>
                  <td className="mono">0.0%</td>
                </tr>
              </tbody>
            </table>
          </CollapsibleSection>
        )}
      </div>
    </div>
  );
}

function KpiItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-kpi">
      <div className="mono" style={{ fontSize: '1.3rem', fontWeight: 700 }}>{value}</div>
      <div>{label}</div>
    </div>
  );
}

function TrustBadge({ level }: { level: string }) {
  const config: Record<string, { label: string; cls: string }> = {
    too_early: { label: 'Too Early', cls: 'badge-red' },
    preliminary: { label: 'Preliminary', cls: 'badge-amber' },
    developing: { label: 'Developing', cls: 'badge-blue' },
    established: { label: 'Established', cls: 'badge-yellow-green' },
    mature: { label: 'Mature', cls: 'badge-green' },
  };
  const c = config[level] || config.too_early;
  return <span className={`badge ${c.cls}`}>{c.label}</span>;
}
