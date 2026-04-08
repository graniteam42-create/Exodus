import type { Asset } from '@/lib/types';

const assetColors: Record<Asset, string> = {
  GLD: '#B8860B',
  SLV: '#8A8A8A',
  QQQ: '#2C5F82',
  Cash: '#444C56',
};

interface SignalBadgeProps {
  asset: Asset;
  size?: 'sm' | 'lg';
}

export default function SignalBadge({ asset, size = 'sm' }: SignalBadgeProps) {
  if (size === 'lg') {
    return (
      <div className="detail-signal-badge" style={{ background: assetColors[asset] }}>
        {asset}
      </div>
    );
  }

  return (
    <span className={`signal-${asset.toLowerCase()}`} style={{ fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", fontSize: '0.78rem' }}>
      {asset}
    </span>
  );
}
