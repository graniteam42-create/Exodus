interface GradientBarProps {
  value: number;
  min: number;
  max: number;
  invert?: boolean;  // if true, low = bad (red left), high = good (green right)
}

export default function GradientBar({ value, min, max, invert = false }: GradientBarProps) {
  const range = max - min;
  const pct = range > 0 ? Math.max(0, Math.min(100, ((value - min) / range) * 100)) : 50;

  return (
    <div>
      <div className={`gradient-bar ${invert ? 'gradient-bar-inverse' : ''}`}>
        <div className="gradient-marker" style={{ left: `${pct}%` }} />
      </div>
      <div className="macro-range">
        <span className="mono">{formatNum(min)}</span>
        <span className="mono">{formatNum(max)}</span>
      </div>
    </div>
  );
}

function formatNum(n: number): string {
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(0)}T`;
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(0)}B`;
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(2) + '%';
}
