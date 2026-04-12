'use client';

import { useState } from 'react';
import type { StrategyResult, Asset } from '@/lib/types';
import { scoreToGrade, gradeColor } from '@/lib/types';
import { allRules } from '@/lib/engine/rules/index';
import SignalBadge from './SignalBadge';
import CollapsibleSection from './CollapsibleSection';

// Build a lookup map once
const ruleMap = new Map(allRules.map(r => [r.id, r]));

const categoryNames: Record<string, string> = {
  A: 'Yield Curve', B: 'Credit', C: 'Labor', D: 'Inflation',
  E: 'Volatility', F: 'Momentum', G: 'Mean Reversion', H: 'Cross-Asset',
  I: 'Leading Indicators', J: 'Liquidity', K: 'Sentiment', L: 'Seasonal', M: 'Composite',
};

interface StrategyPoolRowProps {
  strategy: StrategyResult & { name: string; rules: string[] };
  onToggleSave: (strategyId: string) => void;
}

/** Safe number: converts null/undefined/NaN to 0 */
function n(v: any): number {
  return typeof v === 'number' && isFinite(v) ? v : 0;
}

export default function StrategyPoolRow({ strategy, onToggleSave }: StrategyPoolRowProps) {
  const [expanded, setExpanded] = useState(false);
  const ratingGrade = scoreToGrade(n(strategy.rating_score));
  const robustGrade = scoreToGrade(n(strategy.robustness_score));

  return (
    <>
      <tr
        className={`sp-row ${expanded ? 'expanded' : ''}`}
        onClick={() => setExpanded(!expanded)}
      >
        <td>
          <button
            className={`fav-star ${strategy.saved ? 'saved' : ''}`}
            onClick={(e) => { e.stopPropagation(); onToggleSave(strategy.strategy_id); }}
          >
            &#9829;
          </button>
        </td>
        <td style={{ fontWeight: 600 }}>{strategy.name}</td>
        <td><SignalBadge asset={strategy.signal} /></td>
        <td className="score-cell">
          <span className="score-grade" style={{ color: gradeColor(ratingGrade) }}>{ratingGrade}</span>
          <span className="score-num">{Math.round(n(strategy.rating_score))}</span>
        </td>
        <td className="score-cell">
          <span className="score-grade" style={{ color: gradeColor(robustGrade) }}>{robustGrade}</span>
          <span className="score-num">{Math.round(n(strategy.robustness_score))}</span>
        </td>
        <td className="mono" style={{ color: n(strategy.cagr) > 0 ? 'var(--green-light)' : 'var(--red)' }}>
          {n(strategy.cagr) > 0 ? '+' : ''}{(n(strategy.cagr) * 100).toFixed(1)}%
        </td>
        <td className="mono">{n(strategy.sharpe).toFixed(2)}</td>
        <td className="mono" style={{ color: 'var(--red)' }}>
          {(n(strategy.max_drawdown) * 100).toFixed(1)}%
        </td>
        <td className="mono">{n(strategy.profit_factor).toFixed(2)}</td>
        <td className="mono">{n(strategy.trades_per_year).toFixed(1)}</td>
      </tr>
      {expanded && (
        <tr className="sp-detail open">
          <td colSpan={10}>
            <StrategyDetail strategy={strategy} />
          </td>
        </tr>
      )}
    </>
  );
}

function StrategyDetail({ strategy }: { strategy: StrategyResult & { name: string; rules: string[] } }) {
  const ratingGrade = scoreToGrade(strategy.rating_score);
  const robustGrade = scoreToGrade(strategy.robustness_score);
  const ratingClass = ratingGrade.startsWith('A') ? 'grade-a' : ratingGrade.startsWith('B') ? 'grade-b' : ratingGrade.startsWith('C') ? 'grade-c' : 'grade-d';
  const robustClass = robustGrade.startsWith('A') ? 'grade-a' : robustGrade.startsWith('B') ? 'grade-b' : robustGrade.startsWith('C') ? 'grade-c' : 'grade-d';

  const assetColor: Record<string, string> = {
    GLD: '#B8860B', SLV: '#8A8A8A', QQQ: '#2C5F82', Cash: '#444C56',
  };

  return (
    <div className="detail-inner">
      <div className="detail-top">
        <div className="detail-signal-badge" style={{ background: assetColor[strategy.signal] || '#444' }}>
          {strategy.signal}
        </div>
        <div className="detail-kpis">
          <KpiItem label="CAGR" value={`${n(strategy.cagr) > 0 ? '+' : ''}${(n(strategy.cagr) * 100).toFixed(1)}%`} score={n(strategy.rating_score)} />
          <KpiItem label="Sharpe" value={n(strategy.sharpe).toFixed(2)} score={n(strategy.rating_score)} />
          <KpiItem label="Max DD" value={`${(n(strategy.max_drawdown) * 100).toFixed(1)}%`} score={n(strategy.rating_score)} />
          <KpiItem label="Profit F." value={`${n(strategy.profit_factor).toFixed(1)}x`} score={n(strategy.rating_score)} />
          <KpiItem label="Trades/yr" value={n(strategy.trades_per_year).toFixed(1)} score={n(strategy.rating_score)} />
        </div>
        <div className="detail-grades">
          <div className={`grade-box ${ratingClass}`}>
            {ratingGrade}
            <div className="grade-label">Rating</div>
          </div>
          <div className={`grade-box ${robustClass}`}>
            {robustGrade}
            <div className="grade-label">Robust</div>
          </div>
        </div>
      </div>

      <CollapsibleSection title={`Strategy Logic (${strategy.rules.length} rules)`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {strategy.rules.map(ruleId => {
            const rule = ruleMap.get(ruleId);
            if (!rule) return <div key={ruleId} style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Unknown rule: {ruleId}</div>;
            return (
              <div key={ruleId} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, borderLeft: `3px solid ${rule.asset === 'GLD' ? '#B8860B' : rule.asset === 'QQQ' ? '#2C5F82' : rule.asset === 'SLV' ? '#8A8A8A' : '#444C56'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{rule.name}</span>
                  <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
                    {categoryNames[rule.category] || rule.category} &middot; {rule.id} &middot; favors {rule.asset}
                  </span>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  <strong>When:</strong> {rule.condition}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 2 }}>
                  {rule.thesis}
                </div>
              </div>
            );
          })}
        </div>
        <StrategyInterpretation rules={strategy.rules} signal={strategy.signal} cagr={n(strategy.cagr)} sharpe={n(strategy.sharpe)} totalTrades={n(strategy.total_trades)} />
      </CollapsibleSection>

      <CollapsibleSection title="Robustness Assessment">
        <RobustnessExplanation
          grade={robustGrade}
          cpcvPassRate={n(strategy.cpcv_pass_rate)}
          dsr={n(strategy.dsr)}
          pbo={n(strategy.pbo)}
          sensitivityPass={strategy.sensitivity_pass}
          totalTrades={n(strategy.total_trades)}
          sharpe={n(strategy.sharpe)}
          profitFactor={n(strategy.profit_factor)}
          maxDrawdown={n(strategy.max_drawdown)}
        />
      </CollapsibleSection>
    </div>
  );
}

const KPI_TOOLTIPS: Record<string, string> = {
  'CAGR': 'Compound Annual Growth Rate — the average yearly return if gains were reinvested. E.g., +10% CAGR means $100 becomes $259 after 10 years.',
  'Sharpe': 'Risk-adjusted return — how much return you get per unit of risk. Above 1.0 is good, above 1.5 is excellent. E.g., Sharpe 1.2 means strong returns relative to volatility.',
  'Max DD': 'Maximum Drawdown — the worst peak-to-trough drop. E.g., -18% means at its worst, the strategy lost 18% from its highest point before recovering.',
  'Profit F.': 'Profit Factor — total gains divided by total losses. E.g., 3.0x means the strategy earned $3 for every $1 it lost. Above 2.0x is strong.',
  'Trades/yr': 'Average number of trades per year. E.g., 8.0 means the strategy switches positions about 8 times a year, or roughly every 6-7 weeks.',
};

function KpiItem({ label, value }: { label: string; value: string; score: number }) {
  const tooltip = KPI_TOOLTIPS[label];
  return (
    <div className="detail-kpi" style={{ position: 'relative', cursor: tooltip ? 'help' : 'default' }}>
      <div className="mono" style={{ fontSize: '1.3rem', fontWeight: 700 }}>{value}</div>
      <div style={{ borderBottom: tooltip ? '1px dotted var(--text-muted)' : 'none' }}>{label}</div>
      {tooltip && <div className="kpi-tooltip">{tooltip}</div>}
    </div>
  );
}

function StrategyInterpretation({ rules, signal, cagr, sharpe, totalTrades }: { rules: string[]; signal: string; cagr: number; sharpe: number; totalTrades: number }) {
  const ruleDetails = rules.map(id => ruleMap.get(id)).filter(Boolean);
  const categories = Array.from(new Set(ruleDetails.map(r => r!.category)));
  const catNames = categories.map(c => categoryNames[c] || c);
  const assets = Array.from(new Set(ruleDetails.map(r => r!.asset)));

  // Build narrative
  const diverseCategories = categories.length >= 3;
  const hasMacro = categories.some(c => ['A', 'B', 'C', 'D', 'I', 'J'].includes(c));
  const hasTechnical = categories.some(c => ['E', 'F', 'G'].includes(c));
  const mixedSignals = assets.length > 2;

  let narrative = `This strategy combines ${catNames.join(', ')} signals. `;

  if (hasMacro && hasTechnical) {
    narrative += 'It blends macroeconomic indicators with technical analysis, which tends to be more robust than relying on either alone. ';
  } else if (hasMacro) {
    narrative += 'It relies purely on macroeconomic data, which changes slowly and is less prone to overfitting. ';
  } else if (hasTechnical) {
    narrative += 'It relies purely on technical/price-based signals, which react faster but can be more prone to noise. ';
  }

  if (totalTrades < 30) {
    narrative += `With only ${totalTrades} trades in the backtest, results are still somewhat uncertain. `;
  } else if (totalTrades < 60) {
    narrative += `${totalTrades} trades provides a reasonable sample for backtesting. `;
  } else {
    narrative += `${totalTrades} trades gives a strong statistical foundation. `;
  }

  // Benchmark context
  const cagrPct = (cagr * 100).toFixed(1);
  narrative += `The strategy\'s ${cagrPct}% CAGR compares to typical buy-and-hold benchmarks: Gold ~8%/yr, QQQ ~12%/yr, Cash ~2%/yr over the same period. `;

  if (sharpe > 1.0 && cagr > 0.10) {
    narrative += 'The combination of strong CAGR and Sharpe suggests genuine edge, though out-of-sample testing would strengthen confidence.';
  } else if (sharpe > 0.7) {
    narrative += 'Performance metrics are decent but not exceptional \u2014 worth monitoring as part of a diversified set of strategies.';
  } else {
    narrative += 'Performance is modest. Consider whether the thesis makes economic sense before relying on backtest numbers alone.';
  }

  return (
    <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: 6, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
      <strong style={{ color: 'var(--text)' }}>Interpretation:</strong> {narrative}
    </div>
  );
}

function RobustnessExplanation({ grade, cpcvPassRate, dsr, pbo, sensitivityPass, totalTrades, sharpe, profitFactor, maxDrawdown }: {
  grade: string; cpcvPassRate: number; dsr: number; pbo: number; sensitivityPass: boolean;
  totalTrades: number; sharpe: number; profitFactor: number; maxDrawdown: number;
}) {
  const checks: { label: string; pass: boolean; explanation: string }[] = [];

  // Trade count
  if (totalTrades >= 60) {
    checks.push({ label: 'Sample size', pass: true, explanation: `${totalTrades} trades \u2014 strong sample for statistical confidence` });
  } else if (totalTrades >= 30) {
    checks.push({ label: 'Sample size', pass: true, explanation: `${totalTrades} trades \u2014 reasonable sample, directionally reliable` });
  } else {
    checks.push({ label: 'Sample size', pass: false, explanation: `Only ${totalTrades} trades \u2014 results still uncertain at this sample size` });
  }

  // Win/Loss ratio (profit factor)
  if (profitFactor > 2) {
    checks.push({ label: 'Win/Loss ratio', pass: true, explanation: `${profitFactor.toFixed(1)}x \u2014 total gains are ${profitFactor.toFixed(1)}\u00D7 larger than total losses` });
  } else if (profitFactor > 1.2) {
    checks.push({ label: 'Win/Loss ratio', pass: true, explanation: `${profitFactor.toFixed(1)}x \u2014 winning trades outweigh losing trades` });
  } else if (profitFactor > 0) {
    checks.push({ label: 'Win/Loss ratio', pass: false, explanation: `${profitFactor.toFixed(1)}x \u2014 barely profitable, close to breakeven after costs` });
  }

  // Drawdown
  const dd = Math.abs(maxDrawdown);
  if (dd < 0.15) {
    checks.push({ label: 'Max drawdown', pass: true, explanation: `${(dd * 100).toFixed(0)}% \u2014 well-contained risk` });
  } else if (dd < 0.25) {
    checks.push({ label: 'Max drawdown', pass: true, explanation: `${(dd * 100).toFixed(0)}% \u2014 moderate, within normal range for tactical strategies` });
  } else {
    checks.push({ label: 'Max drawdown', pass: false, explanation: `${(dd * 100).toFixed(0)}% \u2014 significant drawdown, may be hard to stomach` });
  }

  // Sharpe
  if (sharpe > 1.0) {
    checks.push({ label: 'Risk-adjusted return', pass: true, explanation: `Sharpe ${sharpe.toFixed(2)} \u2014 strong risk-adjusted performance` });
  } else if (sharpe > 0.5) {
    checks.push({ label: 'Risk-adjusted return', pass: true, explanation: `Sharpe ${sharpe.toFixed(2)} \u2014 decent risk-adjusted return` });
  } else {
    checks.push({ label: 'Risk-adjusted return', pass: false, explanation: `Sharpe ${sharpe.toFixed(2)} \u2014 poor risk-adjusted return` });
  }

  // CPCV/DSR/PBO (only if we have real values)
  if (cpcvPassRate > 0 || dsr > 0 || pbo > 0) {
    checks.push({ label: 'Cross-validation', pass: cpcvPassRate > 0.6, explanation: `${Math.round(cpcvPassRate * 28)}/28 CPCV folds passed \u2014 ${cpcvPassRate > 0.6 ? 'strategy works across different time periods' : 'inconsistent across time periods'}` });
  }

  // Overall verdict
  const passCount = checks.filter(c => c.pass).length;
  const verdict = passCount === checks.length
    ? 'All checks pass. This strategy shows signs of a genuine, repeatable edge.'
    : passCount >= checks.length * 0.7
    ? 'Most checks pass. Strategy looks promising but has some weaknesses to watch.'
    : passCount >= checks.length * 0.5
    ? 'Mixed results. The backtest numbers look OK but the statistical evidence is not strong. Could be overfitting.'
    : 'Multiple red flags. These results may be due to luck or overfitting rather than a real market edge.';

  return (
    <div style={{ fontSize: '0.8rem' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        {checks.map((c, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: c.pass ? 'var(--green-light)' : 'var(--red)', fontWeight: 600, width: 16 }}>{c.pass ? '\u2713' : '\u2717'}</span>
            <span style={{ fontWeight: 600, minWidth: 140 }}>{c.label}</span>
            <span style={{ color: 'var(--text-muted)' }}>{c.explanation}</span>
          </div>
        ))}
      </div>
      <div style={{ padding: '8px 12px', background: passCount >= checks.length * 0.7 ? 'rgba(39,174,96,0.06)' : 'rgba(212,128,26,0.06)', border: `1px solid ${passCount >= checks.length * 0.7 ? 'rgba(39,174,96,0.15)' : 'rgba(212,128,26,0.15)'}`, borderRadius: 6, lineHeight: 1.5 }}>
        <strong>Verdict:</strong> {verdict}
      </div>
    </div>
  );
}
