import type { RegimeScore } from '@/lib/types';

interface RegimeAssessmentProps {
  phases: RegimeScore[];
}

const phaseColors: Record<string, string> = {
  late_cycle: 'var(--text-muted)',
  warning: 'var(--amber)',
  crisis: 'var(--red)',
  bottoming: 'var(--blue-light)',
  recovery: 'var(--green-light)',
};

export default function RegimeAssessment({ phases }: RegimeAssessmentProps) {
  const activePhase = phases.reduce((a, b) => a.match_pct > b.match_pct ? a : b);
  const highestScore = activePhase.match_pct;

  // Summary when no phase dominates
  let summary: string;
  if (highestScore >= 75) {
    summary = `Conditions strongly match ${activePhase.label.replace(/Phase \d: /, '')}. Most indicators align with this regime.`;
  } else if (highestScore >= 60) {
    summary = `Conditions lean toward ${activePhase.label.replace(/Phase \d: /, '')}, but not all indicators agree. Mixed signals.`;
  } else {
    summary = 'No clear regime pattern \u2014 conditions are mixed and don\'t strongly match any historical crisis phase. This typically means the market is in a transitional or ambiguous state. Don\'t read too much into any single phase score.';
  }

  return (
    <div className="card">
      <div className="card-title">Regime Assessment &mdash; Market Weather</div>
      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
        {summary}
      </div>
      <div className="regime-phases">
        {phases.map(phase => {
          const color = phaseColors[phase.phase] || 'var(--text-muted)';
          const isActive = phase === activePhase;

          return (
            <div key={phase.phase} className={`regime-phase ${isActive ? 'active' : ''}`}>
              <div className="regime-phase-name" style={{ color: isActive ? color : 'var(--text-muted)' }}>
                {phase.label}
              </div>
              <div className="regime-match mono" style={{ color: isActive ? color : 'var(--text-muted)' }}>
                {Math.round(phase.match_pct)}%
              </div>
              <div className="regime-bar">
                <div
                  className="regime-bar-fill"
                  style={{
                    width: `${phase.match_pct}%`,
                    background: isActive ? color : 'var(--text-muted)',
                  }}
                />
              </div>
              <div className="regime-indicators">
                {phase.indicators.map((ind, i) => (
                  <div key={i} style={{ color: ind.match ? 'var(--green-light)' : 'var(--text-muted)', opacity: ind.match ? 1 : 0.5 }}>
                    {ind.match ? '\u2713' : '\u2717'} {ind.detail}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
