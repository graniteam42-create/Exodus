import type { Asset } from '@/lib/types';

interface AllocationBarProps {
  allocation: Record<Asset, number>; // asset -> percentage 0-100
  breakdown?: { asset: Asset; pct: number; strategies: { name: string; rating: number }[] }[];
}

const assetColors: Record<Asset, string> = {
  GLD: '#B8860B',
  SLV: '#8A8A8A',
  QQQ: '#2C5F82',
  Cash: '#444C56',
};

const assetLabels: Record<Asset, string> = {
  GLD: 'Gold (GLD)',
  SLV: 'Silver (SLV)',
  QQQ: 'Nasdaq (QQQ)',
  Cash: 'Cash',
};

export default function AllocationBar({ allocation, breakdown }: AllocationBarProps) {
  const entries = (Object.entries(allocation) as [Asset, number][])
    .filter(([, pct]) => pct > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div>
      <div className="alloc-bar">
        {entries.map(([asset, pct]) => (
          <div
            key={asset}
            className={`alloc-${asset.toLowerCase()}`}
            style={{ width: `${pct}%`, background: assetColors[asset] }}
          >
            {pct >= 10 ? `${asset} ${Math.round(pct)}%` : ''}
          </div>
        ))}
      </div>
      {breakdown && (
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.7 }}>
          {breakdown.map(({ asset, pct, strategies }) => (
            <div key={asset}>
              <span style={{ color: assetColors[asset] }}>&#9632;</span>{' '}
              {asset} {Math.round(pct)}% &larr;{' '}
              {strategies.map((s, i) => (
                <span key={s.name}>
                  {i > 0 ? ' + ' : ''}
                  {s.name} <span className="mono">({s.rating})</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
