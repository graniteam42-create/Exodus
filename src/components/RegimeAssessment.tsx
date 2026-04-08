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

  return (
    <div className="card">
      <div className="card-title">Regime Assessment &mdash; Market Weather</div>
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
