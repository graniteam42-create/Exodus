import type { RegimeScore, IndicatorSnapshot } from './types';

// Score current conditions against the 5-phase bear market model
export function computeRegimeScores(indicators: IndicatorSnapshot[]): RegimeScore[] {
  const get = (id: string) => indicators.find(i => i.id === id);

  const yc10y2y = get('yield_curve_10y2y');
  const yc10y3m = get('yield_curve_10y3m');
  const hySpreads = get('hy_spread');
  const vix = get('vix');
  const unemployment = get('unemployment');
  const sahm = get('sahm');
  const fedFunds = get('fed_funds');
  const nfci = get('nfci');
  const cpi = get('cpi');

  // Phase 0: Late Cycle Excess
  const lateCycleChecks = [
    { name: 'VIX < 15', match: vix ? vix.current_value < 15 : false, detail: `VIX ${vix?.current_value?.toFixed(1) ?? '?'} ${vix && vix.current_value < 15 ? '< 15' : '>= 15'}` },
    { name: 'Credit spreads tight', match: hySpreads ? hySpreads.current_value < 3.0 : false, detail: `HY spread ${hySpreads?.current_value?.toFixed(2) ?? '?'}pp ${hySpreads && hySpreads.current_value < 3 ? '< 3pp' : '>= 3pp'}` },
    { name: 'Yield curve flattening', match: yc10y2y ? yc10y2y.current_value > 0 && yc10y2y.current_value < 0.5 : false, detail: `10Y-2Y ${yc10y2y?.current_value?.toFixed(2) ?? '?'}%` },
    { name: 'Unemployment at lows', match: unemployment ? unemployment.current_value < 4.0 : false, detail: `Unemployment ${unemployment?.current_value?.toFixed(1) ?? '?'}%` },
  ];

  // Phase 1: Warning Signs
  const warningChecks = [
    { name: 'Yield curve inverted', match: yc10y2y ? yc10y2y.current_value < 0 : false, detail: `10Y-2Y ${yc10y2y?.current_value?.toFixed(2) ?? '?'}%` },
    { name: 'Credit spreads widening', match: hySpreads ? hySpreads.current_value > 4.0 : false, detail: `HY spread ${hySpreads?.current_value?.toFixed(2) ?? '?'}pp` },
    { name: 'Unemployment ticking up', match: unemployment ? unemployment.trend_signal === 'bearish' : false, detail: `Unemployment trend: ${unemployment?.trend_signal ?? '?'}` },
    { name: 'VIX creeping above 20', match: vix ? vix.current_value > 20 : false, detail: `VIX ${vix?.current_value?.toFixed(1) ?? '?'}` },
  ];

  // Phase 2: Acute Crisis
  const crisisChecks = [
    { name: 'VIX > 30', match: vix ? vix.current_value > 30 : false, detail: `VIX ${vix?.current_value?.toFixed(1) ?? '?'}` },
    { name: 'HY spreads > 6pp', match: hySpreads ? hySpreads.current_value > 6.0 : false, detail: `HY spread ${hySpreads?.current_value?.toFixed(2) ?? '?'}pp` },
    { name: 'Unemployment surging', match: unemployment ? unemployment.current_value > 5.5 : false, detail: `Unemployment ${unemployment?.current_value?.toFixed(1) ?? '?'}%` },
    { name: 'Fed emergency cutting', match: fedFunds ? fedFunds.trend_signal === 'bullish' && fedFunds.current_value > 3 : false, detail: `Fed funds ${fedFunds?.current_value?.toFixed(2) ?? '?'}%` },
  ];

  // Phase 3: Bottoming / Early Recovery
  const bottomingChecks = [
    { name: 'VIX declining from peak', match: vix ? vix.current_value < 25 && vix.trend_signal !== 'bearish' : false, detail: `VIX ${vix?.current_value?.toFixed(1) ?? '?'}` },
    { name: 'Fed aggressively easing', match: fedFunds ? fedFunds.trend_signal === 'bullish' : false, detail: `Fed trend: ${fedFunds?.trend_signal ?? '?'}` },
    { name: 'Assets deeply oversold', match: false, detail: 'Check RSI on Indicators tab' }, // Would need price data
    { name: 'Sahm Rule triggered', match: sahm ? sahm.current_value >= 0.5 : false, detail: `Sahm ${sahm?.current_value?.toFixed(2) ?? '?'}` },
  ];

  // Phase 4: Recovery / Expansion
  const recoveryChecks = [
    { name: 'Unemployment declining', match: unemployment ? unemployment.trend_signal === 'bullish' : false, detail: `Unemployment trend: ${unemployment?.trend_signal ?? '?'}` },
    { name: 'Yield curve steepening', match: yc10y2y ? yc10y2y.current_value > 0.5 : false, detail: `10Y-2Y ${yc10y2y?.current_value?.toFixed(2) ?? '?'}%` },
    { name: 'VIX normalized (< 20)', match: vix ? vix.current_value < 20 : false, detail: `VIX ${vix?.current_value?.toFixed(1) ?? '?'}` },
    { name: 'Financial conditions loose', match: nfci ? nfci.current_value < -0.3 : false, detail: `NFCI ${nfci?.current_value?.toFixed(2) ?? '?'}` },
  ];

  function scorePhase(checks: typeof lateCycleChecks): number {
    const matched = checks.filter(c => c.match).length;
    return (matched / checks.length) * 100;
  }

  return [
    { phase: 'late_cycle', label: 'Phase 0: Late Cycle', match_pct: scorePhase(lateCycleChecks), indicators: lateCycleChecks },
    { phase: 'warning', label: 'Phase 1: Warning Signs', match_pct: scorePhase(warningChecks), indicators: warningChecks },
    { phase: 'crisis', label: 'Phase 2: Acute Crisis', match_pct: scorePhase(crisisChecks), indicators: crisisChecks },
    { phase: 'bottoming', label: 'Phase 3: Bottoming', match_pct: scorePhase(bottomingChecks), indicators: bottomingChecks },
    { phase: 'recovery', label: 'Phase 4: Recovery', match_pct: scorePhase(recoveryChecks), indicators: recoveryChecks },
  ];
}

// Generate indicator alerts for the Radar page
export function generateIndicatorAlerts(indicators: IndicatorSnapshot[]): {
  level: 'critical' | 'warning';
  title: string;
  detail: string;
  indicatorId: string;
}[] {
  const alerts: { level: 'critical' | 'warning'; title: string; detail: string; indicatorId: string }[] = [];

  for (const ind of indicators) {
    // Alert if both value AND trend are bearish
    if (ind.value_signal === 'bearish' && ind.trend_signal === 'bearish') {
      alerts.push({
        level: ind.status === 'critical' ? 'critical' : 'warning',
        title: `${ind.name}: ${ind.value_text.split('—')[0].trim()}`,
        detail: ind.trend_text,
        indicatorId: ind.id,
      });
    }
    // Alert if status is critical regardless
    else if (ind.status === 'critical') {
      alerts.push({
        level: 'critical',
        title: `${ind.name}: ${ind.value_text.split('—')[0].trim()}`,
        detail: ind.trend_text,
        indicatorId: ind.id,
      });
    }
  }

  // Sort: critical first, then by name
  alerts.sort((a, b) => {
    if (a.level === 'critical' && b.level !== 'critical') return -1;
    if (a.level !== 'critical' && b.level === 'critical') return 1;
    return a.title.localeCompare(b.title);
  });

  return alerts;
}
