import type { DataSourceHealth } from '@/lib/types';

interface DataHealthBarProps {
  sources: DataSourceHealth[];
  dataDate: string;
}

export default function DataHealthBar({ sources, dataDate }: DataHealthBarProps) {
  const hasIssues = sources.some(s => s.status !== 'ok');

  return (
    <div className="data-health-bar">
      <span style={{ fontWeight: 600, color: 'var(--text)' }}>Data as of {dataDate}</span>
      {sources.map(source => (
        <span key={source.source} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span className={`health-dot ${
            source.status === 'ok' ? 'health-ok' :
            source.status === 'lagged' ? 'health-warn' : 'health-error'
          }`} />
          {source.source}
          {source.status !== 'ok' && (
            <span style={{ color: source.status === 'lagged' ? 'var(--amber)' : 'var(--red)', fontSize: '0.65rem' }}>
              ({source.status})
            </span>
          )}
        </span>
      ))}
      {hasIssues && (
        <span style={{ color: 'var(--amber)', fontWeight: 600 }}>
          &#9888; Some data sources are not current
        </span>
      )}
    </div>
  );
}
