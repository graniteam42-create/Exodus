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

export default function StrategyPoolRow({ strategy, onToggleSave }: StrategyPoolRowProps) {
  const [expanded, setExpanded] = useState(false);
  const ratingGrade = scoreToGrade(strategy.rating_score);
  const robustGrade = scoreToGrade(strategy.robustness_score);

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
          <span className="score-num">{Math.round(strategy.rating_score)}</span>
        </td>
        <td className="score-cell">
          <span className="score-grade" style={{ color: gradeColor(robustGrade) }}>{robustGrade}</span>
          <span className="score-num">{Math.round(strategy.robustness_score)}</span>
        </td>
        <td className="mono" style={{ color: strategy.cagr > 0 ? 'var(--green-light)' : 'var(--red)' }}>
          {strategy.cagr > 0 ? '+' : ''}{(strategy.cagr * 100).toFixed(1)}%
        </td>
        <td className="mono">{strategy.sharpe.toFixed(2)}</td>
        <td className="mono" style={{ color: 'var(--red)' }}>
          {(strategy.max_drawdown * 100).toFixed(1)}%
        </td>
        <td className="mono">{strategy.profit_factor.toFixed(2)}</td>
        <td className="mono">{strategy.trades_per_year.toFixed(1)}</td>
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
          <KpiItem label="CAGR" value={`${strategy.cagr > 0 ? '+' : ''}${(strategy.cagr * 100).toFixed(1)}%`} score={strategy.rating_score} />
          <KpiItem label="Sharpe" value={strategy.sharpe.toFixed(2)} score={strategy.rating_score} />
          <KpiItem label="Max DD" value={`${(strategy.max_drawdown * 100).toFixed(1)}%`} score={strategy.rating_score} />
          <KpiItem label="Profit F." value={strategy.profit_factor.toFixed(2)} score={strategy.rating_score} />
          <KpiItem label="Trades/yr" value={strategy.trades_per_year.toFixed(1)} score={strategy.rating_score} />
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
          <span className="mono" style={{ marginLeft: 6 }}>CPCV {Math.round(strategy.cpcv_pass_rate * 28)}/28</span>
          {' \u00B7 '}
          <span className="mono">DSR {strategy.dsr.toFixed(2)}</span>
          {' \u00B7 '}
          <span className="mono">PBO {strategy.pbo.toFixed(2)}</span>
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
