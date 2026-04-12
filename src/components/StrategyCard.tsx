'use client';

import type { StrategyResult, Asset, TradeRecord, PeriodBreakdown, LiveTrackRecord } from '@/lib/types';
import { scoreToGrade } from '@/lib/types';
import SignalBadge from './SignalBadge';
import CollapsibleSection from './CollapsibleSection';

export interface RuleInfo {
  id: string;
  name: string;
  condition: string;
  asset: Asset;
  thesis: string;
  category: string;
}

interface StrategyCardProps {
  strategy: StrategyResult & {
    name: string;
    rules: string[];
    activeRules?: { id: string; active: boolean; value?: string }[];
    trades?: TradeRecord[];
    periods?: PeriodBreakdown[];
    liveTrack?: LiveTrackRecord;
  };
  ruleInfo?: Record<string, RuleInfo>;
  benchmarks?: { assets: Record<string, { cagr: number; totalReturn: number }>; years: number; startDate: string; endDate: string } | null;
  onUnsave?: (id: string) => void;
}

const assetColor: Record<string, string> = {
  GLD: '#B8860B', SLV: '#8A8A8A', QQQ: '#2C5F82', Cash: '#444C56',
};

const CATEGORY_LABELS: Record<string, string> = {
  A: 'Interest Rates', B: 'Credit & Spreads', C: 'Fed Policy',
  D: 'Inflation', E: 'Volatility', F: 'Momentum & Trend',
  G: 'Macro/GDP', H: 'Cross-Asset', I: 'Sentiment',
  J: 'Seasonality', K: 'Dollar', L: 'Commodities', M: 'Liquidity',
};

export default function StrategyCard({ strategy, ruleInfo, benchmarks, onUnsave }: StrategyCardProps) {
  const ratingGrade = scoreToGrade(strategy.rating_score);
  const robustGrade = scoreToGrade(strategy.robustness_score);
  const ratingClass = ratingGrade.startsWith('A') ? 'grade-a' : ratingGrade.startsWith('B') ? 'grade-b' : ratingGrade.startsWith('C') ? 'grade-c' : 'grade-d';
  const robustClass = robustGrade.startsWith('A') ? 'grade-a' : robustGrade.startsWith('B') ? 'grade-b' : robustGrade.startsWith('C') ? 'grade-c' : 'grade-d';

  // Build rule details from ruleInfo prop, with active status
  const ruleDetails = strategy.rules.map(id => ruleInfo?.[id]).filter(Boolean) as RuleInfo[];
  const activeMap = new Map((strategy.activeRules || []).map(r => [r.id, r.active]));

  // Compute trade stats for robustness display
  const trades = strategy.trades || [];
  const goodCalls = trades.filter(t => t.good_call).length;
  const captureRate = trades.length > 0 ? goodCalls / trades.length : 0;

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
            <KpiItem label="Profit F." value={`${strategy.profit_factor.toFixed(1)}x`} />
            <KpiItem label="Capture" value={`${(captureRate * 100).toFixed(0)}%`} />
            <KpiItem label="Trades/yr" value={strategy.trades_per_year.toFixed(1)} />
          </div>
          <div className="detail-grades">
            <div className={`grade-box ${ratingClass}`}>{ratingGrade}<div className="grade-label">Rating</div></div>
            <div className={`grade-box ${robustClass}`}>{robustGrade}<div className="grade-label">Robust</div></div>
          </div>
        </div>

        {/* Signal explanation */}
        {strategy.activeRules && strategy.activeRules.length > 0 && (
          <SignalExplanation activeRules={strategy.activeRules} signal={strategy.signal} ruleInfo={ruleInfo} totalRules={strategy.rules.length} />
        )}

        {/* Benchmark comparison */}
        {benchmarks && (
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', padding: '6px 0 2px', fontSize: '0.78rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>vs B&H CAGR:</span>
            {Object.entries(benchmarks.assets).map(([asset, b]) => {
              const diff = strategy.cagr - b.cagr;
              return (
                <span key={asset}>
                  <span style={{ color: assetColor[asset] || '#888', fontWeight: 600 }}>{asset}</span>
                  <span className="mono" style={{ marginLeft: 4, color: diff > 0 ? 'var(--green-light)' : 'var(--red)', fontWeight: 600 }}>
                    {diff > 0 ? '+' : ''}{(diff * 100).toFixed(1)}%
                  </span>
                </span>
              );
            })}
          </div>
        )}

        {/* Strategy Rules — human-readable */}
        <CollapsibleSection title={`Strategy Rules (${strategy.rules.length})`}>
          {ruleDetails.length > 0 ? (
            <div>
              {ruleDetails.map(rule => {
                const isActive = activeMap.get(rule.id);
                const hasStatus = isActive !== undefined;
                return (
                  <div key={rule.id} style={{ marginBottom: 14, padding: '10px 12px', background: 'var(--bg)', borderRadius: 6, borderLeft: `3px solid ${assetColor[rule.asset] || '#666'}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'var(--card)', padding: '1px 6px', borderRadius: 3 }}>{rule.id}</span>
                      <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{rule.name}</span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>({CATEGORY_LABELS[rule.category] || rule.category})</span>
                      <SignalBadge asset={rule.asset} />
                      {hasStatus && (
                        <span style={{
                          fontSize: '0.7rem', fontWeight: 700, padding: '1px 8px', borderRadius: 3,
                          background: isActive ? 'rgba(63, 185, 80, 0.15)' : 'rgba(200, 60, 60, 0.15)',
                          color: isActive ? 'var(--green-light)' : 'var(--red)',
                        }}>
                          {isActive ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      )}
                    </div>
                    <div className="mono" style={{ fontSize: '0.8rem', marginBottom: 3 }}>
                      {rule.condition}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      {rule.thesis}
                    </div>
                  </div>
                );
              })}
              <StrategyAssessment rules={ruleDetails} />
            </div>
          ) : (
            <div>
              {strategy.rules.map(ruleId => (
                <div key={ruleId} className="rule-item">
                  <span className="rule-status rule-active">Rule</span>
                  <span><strong>{ruleId}</strong></span>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>

        {/* Robustness Assessment */}
        <CollapsibleSection title="Robustness Assessment">
          <RobustnessAssessment strategy={strategy} trades={trades} captureRate={captureRate} goodCalls={goodCalls} totalTrades={trades.length} />
          {strategy.periods && strategy.periods.length > 0 && (
            <div className="table-scroll" style={{ marginTop: 12 }}>
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
        {trades.length > 0 && (
          <CollapsibleSection title={`Trade Log (${trades.length} trades)`}>
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              <table>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--card)' }}>
                  <tr><th>From</th><th>To</th><th>Holding</th><th>Days</th><th>Return</th><th>Good Call?</th></tr>
                </thead>
                <tbody>
                  {trades.map((t, i) => (
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

/** Analyzes rule combination and flags potential issues */
function StrategyAssessment({ rules }: { rules: RuleInfo[] }) {
  const catArr = Array.from(new Set(rules.map(r => r.category)));
  const assetArr = Array.from(new Set(rules.map(r => r.asset)));

  const findings: { type: 'good' | 'warn' | 'neutral'; text: string }[] = [];

  // Diversity of signal sources
  if (catArr.length >= 3) {
    findings.push({ type: 'good', text: `Draws from ${catArr.length} independent signal categories (${catArr.map(c => CATEGORY_LABELS[c] || c).join(', ')}) — reduces overfitting risk` });
  } else if (catArr.length === 2) {
    findings.push({ type: 'neutral', text: `Uses 2 signal categories (${catArr.map(c => CATEGORY_LABELS[c] || c).join(', ')})` });
  } else {
    findings.push({ type: 'warn', text: `All rules from one category (${CATEGORY_LABELS[catArr[0]] || catArr[0]}) — higher overfitting risk, single point of failure` });
  }

  // Asset diversity
  if (assetArr.length >= 3) {
    findings.push({ type: 'good', text: 'Rules target multiple assets — strategy can adapt to different regimes' });
  } else if (assetArr.length === 1) {
    findings.push({ type: 'neutral', text: `All rules favor ${assetArr[0]} — a focused, single-conviction strategy` });
  }

  // Check for thesis coherence
  const hasMacro = catArr.some(c => ['A', 'B', 'C', 'D', 'G'].includes(c));
  const hasTechnical = catArr.some(c => ['F', 'E'].includes(c));
  if (hasMacro && hasTechnical) {
    findings.push({ type: 'good', text: 'Combines macro fundamentals with technical signals — thesis is grounded in both economics and price action' });
  } else if (!hasMacro && hasTechnical) {
    findings.push({ type: 'neutral', text: 'Purely technical/momentum-based — works in trending markets but may lag at turning points' });
  } else if (hasMacro && !hasTechnical) {
    findings.push({ type: 'neutral', text: 'Purely macro-driven — strong economic rationale but may be slow to react to price moves' });
  }

  return (
    <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--bg)', borderRadius: 6 }}>
      <div style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: 6 }}>Strategy Assessment</div>
      {findings.map((f, i) => (
        <div key={i} style={{ fontSize: '0.78rem', marginBottom: 4, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <span style={{ flexShrink: 0 }}>{f.type === 'good' ? '\u2713' : f.type === 'warn' ? '\u2717' : '\u2022'}</span>
          <span style={{ color: f.type === 'good' ? 'var(--green-light)' : f.type === 'warn' ? 'var(--red)' : 'var(--text-muted)' }}>{f.text}</span>
        </div>
      ))}
    </div>
  );
}

/** Explains why the strategy is currently in Cash or a specific asset */
function SignalExplanation({ activeRules, signal, ruleInfo, totalRules }: {
  activeRules: { id: string; active: boolean; value?: string }[];
  signal: string;
  ruleInfo?: Record<string, RuleInfo>;
  totalRules: number;
}) {
  const activeCount = activeRules.filter(r => r.active).length;
  const majorityNeeded = Math.floor(totalRules / 2) + 1;

  // Count votes by asset
  const votes: Record<string, string[]> = {};
  for (const r of activeRules) {
    if (r.active) {
      const info = ruleInfo?.[r.id];
      const asset = info?.asset || r.value || '?';
      if (!votes[asset]) votes[asset] = [];
      votes[asset].push(info?.id || r.id);
    }
  }

  const voteDesc = Object.entries(votes)
    .map(([asset, ids]) => `${ids.join(', ')} \u2192 ${asset}`)
    .join('; ');

  let explanation: string;
  if (signal === 'Cash') {
    if (activeCount === 0) {
      explanation = `No rules are active \u2014 all conditions are currently false, so strategy defaults to Cash.`;
    } else {
      explanation = `Only ${activeCount}/${totalRules} rules active (need ${majorityNeeded} for majority). ${voteDesc}. Not enough conviction to leave Cash.`;
    }
  } else {
    explanation = `${activeCount}/${totalRules} rules active (majority met). ${voteDesc}. Majority vote \u2192 ${signal}.`;
  }

  return (
    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', padding: '4px 0 2px', fontStyle: 'italic' }}>
      {explanation}
    </div>
  );
}

/** Human-readable robustness assessment based on actual metrics */
function RobustnessAssessment({ strategy, trades, captureRate, goodCalls, totalTrades }: {
  strategy: StrategyResult;
  trades: TradeRecord[];
  captureRate: number;
  goodCalls: number;
  totalTrades: number;
}) {
  const checks: { label: string; pass: boolean; detail: string }[] = [];

  // Profit factor
  checks.push({
    label: 'Profitable trades outweigh losers',
    pass: strategy.profit_factor > 1,
    detail: `Win/Loss ratio: ${strategy.profit_factor.toFixed(2)} ${strategy.profit_factor > 2 ? '(strong)' : strategy.profit_factor > 1.5 ? '(decent)' : strategy.profit_factor > 1 ? '(marginal)' : '(losing money)'}`,
  });

  // Sharpe quality
  checks.push({
    label: 'Risk-adjusted returns are adequate',
    pass: strategy.sharpe > 0.5,
    detail: `Sharpe: ${strategy.sharpe.toFixed(2)} ${strategy.sharpe > 1.0 ? '(excellent)' : strategy.sharpe > 0.5 ? '(good)' : strategy.sharpe > 0.3 ? '(weak)' : '(poor)'}`,
  });

  // Drawdown
  const ddPct = Math.abs(strategy.max_drawdown) * 100;
  checks.push({
    label: 'Drawdowns are controlled',
    pass: ddPct < 20,
    detail: `Worst drawdown: ${ddPct.toFixed(1)}% ${ddPct < 10 ? '(excellent)' : ddPct < 20 ? '(acceptable)' : ddPct < 30 ? '(concerning)' : '(severe)'}`,
  });

  // Trade count
  checks.push({
    label: 'Enough trades for statistical significance',
    pass: totalTrades > 10,
    detail: `${totalTrades} trades over backtest period ${totalTrades > 30 ? '(strong sample)' : totalTrades > 15 ? '(adequate)' : '(limited — results may not be reliable)'}`,
  });

  // Capture rate
  if (totalTrades > 0) {
    checks.push({
      label: 'Captures the best-performing asset',
      pass: captureRate >= 0.75,
      detail: `${goodCalls}/${totalTrades} trades (${(captureRate * 100).toFixed(0)}%) held the best asset ${captureRate >= 0.85 ? '(excellent)' : captureRate >= 0.75 ? '(good)' : captureRate >= 0.6 ? '(mediocre)' : '(poor — strategy picks wrong asset too often)'}`,
    });
  }

  // Win rate (computed from trades)
  const wins = totalTrades > 0 ? trades.filter((t: any) => t.return_pct > 0).length : 0;
  const winRate = totalTrades > 0 ? wins / totalTrades : 0;
  checks.push({
    label: 'Win rate is healthy',
    pass: winRate > 0.55,
    detail: `${(winRate * 100).toFixed(0)}% of trades are profitable ${winRate > 0.7 ? '(excellent)' : winRate > 0.55 ? '(good)' : winRate > 0.45 ? '(average)' : '(below average)'}`,
  });

  const passCount = checks.filter(c => c.pass).length;
  const verdict = passCount === checks.length ? 'Strong' : passCount >= checks.length - 1 ? 'Good' : passCount >= checks.length / 2 ? 'Mixed' : 'Weak';
  const verdictColor = verdict === 'Strong' ? 'var(--green-light)' : verdict === 'Good' ? 'var(--green-light)' : verdict === 'Mixed' ? '#D4A017' : 'var(--red)';

  return (
    <div>
      <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
        <strong>Verdict:</strong>
        <span style={{ color: verdictColor, fontWeight: 700 }}>{verdict}</span>
        <span className="mono" style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>({passCount}/{checks.length} checks passed)</span>
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        {checks.map((c, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, fontSize: '0.8rem', alignItems: 'flex-start' }}>
            <span style={{ color: c.pass ? 'var(--green-light)' : 'var(--red)', fontWeight: 700, flexShrink: 0 }}>
              {c.pass ? '\u2713' : '\u2717'}
            </span>
            <div>
              <span style={{ fontWeight: 600 }}>{c.label}</span>
              <span className="mono" style={{ marginLeft: 8, color: 'var(--text-muted)', fontSize: '0.75rem' }}>{c.detail}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const KPI_TOOLTIPS: Record<string, string> = {
  'CAGR': 'Compound Annual Growth Rate — the average yearly return if gains were reinvested. E.g., +10% CAGR means $100 becomes $259 after 10 years.',
  'Sharpe': 'Risk-adjusted return — how much return you get per unit of risk. Above 1.0 is good, above 1.5 is excellent. E.g., Sharpe 1.2 means strong returns relative to volatility.',
  'Max DD': 'Maximum Drawdown — the worst peak-to-trough drop. E.g., -18% means at its worst, the strategy lost 18% from its highest point before recovering.',
  'Profit F.': 'Profit Factor — total gains divided by total losses. E.g., 3.0x means the strategy earned $3 for every $1 it lost. Above 2.0x is strong.',
  'Capture': 'Best-asset capture rate — % of trades where the strategy held the best-performing asset. E.g., 85% means 85 out of 100 trades picked the winner.',
  'Trades/yr': 'Average number of trades per year. E.g., 8.0 means the strategy switches positions about 8 times a year, or roughly every 6-7 weeks.',
};

function KpiItem({ label, value }: { label: string; value: string }) {
  const tooltip = KPI_TOOLTIPS[label];
  return (
    <div className="detail-kpi" style={{ position: 'relative', cursor: tooltip ? 'help' : 'default' }}>
      <div className="mono" style={{ fontSize: '1.3rem', fontWeight: 700 }}>{value}</div>
      <div style={{ borderBottom: tooltip ? '1px dotted var(--text-muted)' : 'none' }}>{label}</div>
      {tooltip && <div className="kpi-tooltip">{tooltip}</div>}
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
