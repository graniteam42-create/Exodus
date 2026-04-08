import type { IndicatorSnapshot, SignalDirection } from '@/lib/types';
import GradientBar from './GradientBar';
import FreshnessBadge from './FreshnessBadge';

interface IndicatorCardProps {
  indicator: IndicatorSnapshot;
}

function signalClass(signal: SignalDirection): string {
  if (signal === 'bearish') return 'signal-bearish';
  if (signal === 'bullish') return 'signal-bullish';
  return 'signal-neutral';
}

function signalIcon(signal: SignalDirection): string {
  if (signal === 'bearish') return '\u25BC BEARISH';
  if (signal === 'bullish') return '\u25B2 BULLISH';
  return '\u2014 NEUTRAL';
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'critical': return 'badge-red';
    case 'elevated': return 'badge-amber';
    case 'watch': return 'badge-blue';
    default: return 'badge-green';
  }
}

function valueColor(signal: SignalDirection): string {
  if (signal === 'bearish') return 'var(--red)';
  if (signal === 'bullish') return 'var(--green-light)';
  return 'var(--text)';
}

export default function IndicatorCard({ indicator }: IndicatorCardProps) {
  return (
    <div className="indicator-card">
      <div className="indicator-card-header">
        <div className="indicator-card-title">{indicator.name}</div>
        <span className={`badge ${statusBadgeClass(indicator.status)}`}>
          {indicator.status}
        </span>
      </div>
      <div className="indicator-card-series">{indicator.series_id}</div>
      <div className="indicator-card-value" style={{ color: valueColor(indicator.value_signal) }}>
        {formatValue(indicator.current_value, indicator.series_id)}
      </div>

      <div className="indicator-signals">
        <div className={`signal-row ${signalClass(indicator.value_signal)}`}>
          <span className="signal-row-label">Value</span>
          <span className="signal-row-badge">{signalIcon(indicator.value_signal)}</span>
          <span className="signal-row-text">{indicator.value_text}</span>
        </div>
        <div className={`signal-row ${signalClass(indicator.trend_signal)}`}>
          <span className="signal-row-label">Trend</span>
          <span className="signal-row-badge">{signalIcon(indicator.trend_signal)}</span>
          <span className="signal-row-text">{indicator.trend_text}</span>
        </div>
      </div>

      <GradientBar
        value={indicator.current_value}
        min={indicator.range_min}
        max={indicator.range_max}
        invert={indicator.invert_gradient}
      />

      <div className="indicator-meta">
        <FreshnessBadge freshness={indicator.freshness} />
      </div>
    </div>
  );
}

function formatValue(value: number, seriesId: string): string {
  if (seriesId === 'WALCL') {
    return `$${(value / 1e6).toFixed(1)}T`;
  }
  if (seriesId === 'RRPONTSYD') {
    return `$${(value / 1e3).toFixed(0)}B`;
  }
  if (seriesId === 'BAMLH0A0HYM2') {
    return `${(value * 100).toFixed(0)} bp`;
  }
  if (['ICSA', 'CCSA'].includes(seriesId)) {
    return `${(value / 1000).toFixed(0)}K`;
  }
  if (['VIXCLS', 'SAHMREALTIME', 'NFCI', 'UMCSENT'].includes(seriesId)) {
    return value.toFixed(2);
  }
  return `${value.toFixed(2)}%`;
}
