'use client';

import { useState } from 'react';
import type { StrategyResult, Asset } from '@/lib/types';
import { scoreToGrade, gradeColor } from '@/lib/types';
import SignalBadge from './SignalBadge';
import CollapsibleSection from './CollapsibleSection';

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
          <KpiItem label="Profit F." value={n(strategy.profit_factor).toFixed(2)} score={n(strategy.rating_score)} />
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

      <CollapsibleSection title={`Strategy Rules (${strategy.rules.length})`}>
        <div>
          {strategy.rules.map(ruleId => (
            <div key={ruleId} className="rule-item">
              <span className="rule-status rule-active">Rule</span>
              <span><strong>{ruleId}</strong></span>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Robustness Check">
        <div style={{ marginBottom: 8 }}>
          <strong>Robustness: </strong>
          <span className={`grade-inline ${robustClass}`}>{robustGrade}</span>
          <span className="mono" style={{ marginLeft: 6 }}>CPCV {Math.round(n(strategy.cpcv_pass_rate) * 28)}/28</span>
          {' \u00B7 '}
          <span className="mono">DSR {n(strategy.dsr).toFixed(2)}</span>
          {' \u00B7 '}
          <span className="mono">PBO {n(strategy.pbo).toFixed(2)}</span>
          {' \u00B7 '}
          Sensitivity: {strategy.sensitivity_pass ? 'Pass' : 'Fail'}
        </div>
      </CollapsibleSection>
    </div>
  );
}

function KpiItem({ label, value }: { label: string; value: string; score: number }) {
  return (
    <div className="detail-kpi">
      <div className="mono" style={{ fontSize: '1.3rem', fontWeight: 700 }}>{value}</div>
      <div>{label}</div>
    </div>
  );
}
