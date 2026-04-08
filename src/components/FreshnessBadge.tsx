interface FreshnessBadgeProps {
  freshness: 'live' | 'recent' | 'lagged' | 'stale';
}

const labels: Record<string, string> = {
  live: 'Live',
  recent: 'Recent',
  lagged: 'Lagged',
  stale: 'Stale',
};

export default function FreshnessBadge({ freshness }: FreshnessBadgeProps) {
  return (
    <span className={`freshness fresh-${freshness}`}>
      <span className="freshness-dot" />
      {labels[freshness]}
    </span>
  );
}

export function computeFreshness(lastUpdated: string): 'live' | 'recent' | 'lagged' | 'stale' {
  const now = new Date();
  const updated = new Date(lastUpdated);
  const diffMs = now.getTime() - updated.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays <= 1) return 'live';
  if (diffDays <= 7) return 'recent';
  if (diffDays <= 42) return 'lagged'; // 6 weeks
  return 'stale';
}
