import type { IndicatorConfig, IndicatorSnapshot, FredRow, SignalDirection, DataSourceHealth } from './types';
import { computeFreshness } from '@/components/FreshnessBadge';

// All 23 FRED indicator configurations with interpretation logic
export const INDICATOR_CONFIGS: IndicatorConfig[] = [
  // ===== RATES & YIELD CURVE =====
  {
    id: 'yield_curve_10y2y', fred_series: 'T10Y2Y', name: 'Yield Curve (10Y - 2Y)',
    category: 'rates', unit: '%', range_min: -2.5, range_max: 2.5, frequency: 'daily',
    interpret: (value, prev, data) => {
      const threeMonthsAgo = getValueNMonthsAgo(data, 3);
      const isInverted = value < 0;
      const wasPositive = threeMonthsAgo !== null && threeMonthsAgo > 0;
      return {
        valueSignal: isInverted ? 'bearish' : value < 0.5 ? 'neutral' : 'bullish',
        valueText: isInverted
          ? `Inverted — historically signals recession within 12-18 months${wasPositive ? '. Re-inversion is the most dangerous pattern' : ''}`
          : value < 0.5 ? 'Flattening — approaching inversion territory' : 'Normal — no recession signal',
        trendSignal: threeMonthsAgo !== null && value < threeMonthsAgo - 0.1 ? 'bearish'
          : threeMonthsAgo !== null && value > threeMonthsAgo + 0.1 ? 'bullish' : 'neutral',
        trendText: threeMonthsAgo !== null
          ? `Was ${threeMonthsAgo.toFixed(2)}% three months ago (${value > threeMonthsAgo ? '+' : ''}${(value - threeMonthsAgo).toFixed(2)}pp)`
          : 'Insufficient history',
        status: isInverted ? 'elevated' : value < 0.3 ? 'watch' : 'safe',
      };
    },
  },
  {
    id: 'yield_curve_10y3m', fred_series: 'T10Y3M', name: 'Yield Curve (10Y - 3M)',
    category: 'rates', unit: '%', range_min: -3.0, range_max: 4.0, frequency: 'daily',
    interpret: (value, prev, data) => ({
      valueSignal: value < -0.5 ? 'bearish' : value < 0 ? 'bearish' : 'bullish',
      valueText: value < -0.5 ? 'Deeply inverted — most reliable recession predictor. Every recession since 1970 preceded by this.'
        : value < 0 ? 'Inverted — recession warning from strongest academic predictor'
        : 'Normal — no inversion signal',
      trendSignal: getTrendSignal(data, value, 3),
      trendText: getTrendText(data, 3),
      status: value < -0.5 ? 'critical' : value < 0 ? 'elevated' : 'safe',
    }),
  },
  {
    id: 'real_yield', fred_series: 'DFII10', name: 'Real Yield (10Y TIPS)',
    category: 'rates', unit: '%', range_min: -1.5, range_max: 3.0, invert_gradient: true, frequency: 'daily',
    interpret: (value, prev, data) => ({
      valueSignal: value < -1 ? 'bullish' : value > 2 ? 'bearish' : 'neutral',
      valueText: value < -1 ? 'Deeply negative — bonds losing purchasing power, strong gold driver'
        : value > 2 ? 'High positive — cash competitive, headwind for gold and growth'
        : 'Moderate — no extreme signal for either direction',
      trendSignal: getTrendSignal(data, value, 3, true),
      trendText: getTrendText(data, 3),
      status: value > 2 ? 'watch' : value < -1 ? 'elevated' : 'safe',
    }),
  },
  {
    id: 'breakeven_inflation', fred_series: 'T10YIE', name: 'Breakeven Inflation (10Y)',
    category: 'rates', unit: '%', range_min: 0.5, range_max: 3.5, frequency: 'daily',
    interpret: (value, prev, data) => ({
      valueSignal: value > 2.5 ? 'bearish' : value < 1.5 ? 'bearish' : 'neutral',
      valueText: value > 2.5 ? 'Above target — market expects sticky inflation, keeps Fed restrictive'
        : value < 1.5 ? 'Low — deflation concerns, risk-off'
        : 'Near target — normal inflation expectations',
      trendSignal: getTrendSignal(data, value, 3),
      trendText: getTrendText(data, 3),
      status: value > 2.8 ? 'elevated' : value < 1.5 ? 'watch' : 'safe',
    }),
  },
  {
    id: 'fed_funds', fred_series: 'FEDFUNDS', name: 'Fed Funds Rate',
    category: 'rates', unit: '%', range_min: 0, range_max: 6, frequency: 'monthly',
    interpret: (value, prev, data) => {
      const sixMonthsAgo = getValueNMonthsAgo(data, 6);
      const isHiking = sixMonthsAgo !== null && value > sixMonthsAgo + 0.25;
      const isCutting = sixMonthsAgo !== null && value < sixMonthsAgo - 0.25;
      const isOnHold = !isHiking && !isCutting;
      return {
        valueSignal: value > 4 ? 'bearish' : value < 1 ? 'bullish' : 'neutral',
        valueText: value > 4 ? 'Restrictive — high rates headwind for stocks and gold'
          : value < 1 ? 'Accommodative — supports risk assets'
          : 'Moderate — neither restrictive nor accommodative',
        trendSignal: isCutting ? 'bullish' : isHiking ? 'bearish' : 'neutral',
        trendText: isCutting ? 'Fed cutting — easing financial conditions'
          : isHiking ? 'Fed hiking — tightening financial conditions'
          : `On hold — unchanged for recent months`,
        status: isHiking ? 'elevated' : 'watch',
      };
    },
  },
  {
    id: 'dgs10', fred_series: 'DGS10', name: '10-Year Treasury Yield',
    category: 'rates', unit: '%', range_min: 0, range_max: 6, frequency: 'daily',
    interpret: (value, prev, data) => ({
      valueSignal: value > 4.5 ? 'bearish' : value < 2 ? 'bullish' : 'neutral',
      valueText: value > 4.5 ? 'Elevated — competing with equities for capital' : value < 2 ? 'Low — supportive for risk assets' : 'Normal range',
      trendSignal: getTrendSignal(data, value, 3),
      trendText: getTrendText(data, 3),
      status: value > 4.5 ? 'watch' : 'safe',
    }),
  },
  {
    id: 'dgs2', fred_series: 'DGS2', name: '2-Year Treasury Yield',
    category: 'rates', unit: '%', range_min: 0, range_max: 6, frequency: 'daily',
    interpret: (value, prev, data) => ({
      valueSignal: value > 4.5 ? 'bearish' : 'neutral',
      valueText: value > 4.5 ? 'Market expects rates to stay high' : 'Normal range',
      trendSignal: getTrendSignal(data, value, 3),
      trendText: getTrendText(data, 3),
      status: value > 4.5 ? 'watch' : 'safe',
    }),
  },
  {
    id: 'dgs3mo', fred_series: 'DGS3MO', name: '3-Month Treasury Yield',
    category: 'rates', unit: '%', range_min: 0, range_max: 6, frequency: 'daily',
    interpret: (value, prev, data) => ({
      valueSignal: 'neutral',
      valueText: 'Short-term rate — tracks Fed funds rate closely',
      trendSignal: getTrendSignal(data, value, 3),
      trendText: getTrendText(data, 3),
      status: 'safe',
    }),
  },

  // ===== CREDIT & FINANCIAL CONDITIONS =====
  {
    id: 'hy_spread', fred_series: 'BAMLH0A0HYM2', name: 'High Yield Credit Spread',
    category: 'credit', unit: 'pp', range_min: 2, range_max: 10, frequency: 'daily',
    interpret: (value, prev, data) => {
      const threeMonthsAgo = getValueNMonthsAgo(data, 3);
      const rapidIncrease = threeMonthsAgo !== null && value - threeMonthsAgo > 1.0;
      return {
        valueSignal: value > 6 ? 'bearish' : value > 4 ? 'bearish' : value < 2.5 ? 'bearish' : 'neutral',
        valueText: value > 6 ? 'Crisis level — severe credit stress, risk-off'
          : value > 4 ? 'Elevated — credit stress building'
          : value < 2.5 ? 'Extremely tight — complacency, late cycle risk'
          : 'Normal range — no extreme signal',
        trendSignal: rapidIncrease ? 'bearish' : getTrendSignal(data, value, 3),
        trendText: rapidIncrease && threeMonthsAgo
          ? `Surging +${((value - threeMonthsAgo) * 100).toFixed(0)}bp in 3 months — rapid deterioration`
          : getTrendText(data, 3),
        status: value > 6 ? 'critical' : value > 4 ? 'elevated' : value < 2.5 ? 'watch' : 'safe',
      };
    },
  },
  {
    id: 'nfci', fred_series: 'NFCI', name: 'Financial Conditions Index',
    category: 'credit', unit: '', range_min: -1.0, range_max: 1.0, frequency: 'weekly',
    interpret: (value) => ({
      valueSignal: value > 0 ? 'bearish' : value < -0.5 ? 'bullish' : 'neutral',
      valueText: value > 0 ? 'Tight — financial conditions choking growth' : value < -0.5 ? 'Very loose — supports risk assets' : 'Normal range',
      trendSignal: 'neutral',
      trendText: 'Weekly update',
      status: value > 0 ? 'elevated' : 'safe',
    }),
  },
  {
    id: 'sloos', fred_series: 'DRTSCILM', name: 'Bank Lending Standards (SLOOS)',
    category: 'credit', unit: '%', range_min: -30, range_max: 80, frequency: 'quarterly',
    interpret: (value) => ({
      valueSignal: value > 30 ? 'bearish' : value < 0 ? 'bullish' : 'neutral',
      valueText: value > 30 ? 'Banks tightening aggressively — recession risk' : value < 0 ? 'Banks easing — credit expansion' : 'Moderate lending standards',
      trendSignal: 'neutral',
      trendText: 'Quarterly release — slow-moving',
      status: value > 40 ? 'elevated' : value > 20 ? 'watch' : 'safe',
    }),
  },

  // ===== LABOR MARKET =====
  {
    id: 'unemployment', fred_series: 'UNRATE', name: 'Unemployment Rate',
    category: 'labor', unit: '%', range_min: 3, range_max: 10, frequency: 'monthly',
    interpret: (value, prev, data) => {
      const sixMonthsAgo = getValueNMonthsAgo(data, 6);
      const rising = sixMonthsAgo !== null && value > sixMonthsAgo + 0.3;
      return {
        valueSignal: value > 5 ? 'bearish' : value < 4 ? 'bullish' : 'neutral',
        valueText: value > 5 ? 'Elevated — significant labor market slack'
          : value < 4 ? 'Very tight — supports consumer spending'
          : 'Moderate — direction matters more than level',
        trendSignal: rising ? 'bearish' : 'neutral',
        trendText: sixMonthsAgo !== null
          ? `Was ${sixMonthsAgo.toFixed(1)}% six months ago ${rising ? '— rising is a recession signal' : ''}`
          : 'Insufficient history',
        status: rising ? 'watch' : value > 5 ? 'elevated' : 'safe',
      };
    },
  },
  {
    id: 'sahm', fred_series: 'SAHMREALTIME', name: 'Sahm Rule Recession Indicator',
    category: 'labor', unit: '', range_min: 0, range_max: 1.0, frequency: 'monthly',
    interpret: (value) => ({
      valueSignal: value >= 0.5 ? 'bearish' : value >= 0.3 ? 'bearish' : 'neutral',
      valueText: value >= 0.5 ? 'TRIGGERED — every breach of 0.50 since 1950 = recession'
        : value >= 0.3 ? `${(0.5 - value).toFixed(2)} away from trigger — approaching danger zone`
        : 'Below trigger — no recession signal',
      trendSignal: value >= 0.3 ? 'bearish' : 'neutral',
      trendText: value >= 0.3 ? 'Rising toward 0.50 threshold' : 'Low',
      status: value >= 0.5 ? 'critical' : value >= 0.3 ? 'watch' : 'safe',
    }),
  },
  {
    id: 'initial_claims', fred_series: 'ICSA', name: 'Initial Jobless Claims',
    category: 'labor', unit: 'K', range_min: 150, range_max: 600, frequency: 'weekly',
    interpret: (value, prev, data) => ({
      valueSignal: value > 300000 ? 'bearish' : value < 200000 ? 'bullish' : 'neutral',
      valueText: value > 300000 ? 'Elevated — significant layoffs' : value < 200000 ? 'Very low — strong labor market' : 'Normal range',
      trendSignal: getTrendSignal(data, value, 1),
      trendText: getTrendText(data, 1),
      status: value > 350000 ? 'elevated' : value > 250000 ? 'watch' : 'safe',
    }),
  },
  {
    id: 'continuing_claims', fred_series: 'CCSA', name: 'Continuing Claims',
    category: 'labor', unit: 'K', range_min: 1000, range_max: 4000, frequency: 'weekly',
    interpret: (value) => ({
      valueSignal: value > 2500000 ? 'bearish' : 'neutral',
      valueText: value > 2500000 ? 'Elevated — people struggling to find new jobs' : 'Normal range',
      trendSignal: 'neutral',
      trendText: 'Weekly update',
      status: value > 2500000 ? 'watch' : 'safe',
    }),
  },

  // ===== INFLATION =====
  {
    id: 'cpi', fred_series: 'CPIAUCSL', name: 'CPI All Items (Year-over-Year)',
    category: 'inflation', unit: '%', range_min: 0, range_max: 9, frequency: 'monthly',
    interpret: (value, prev, data) => {
      const yoy = computeYoY(data);
      const v = yoy ?? value;
      return {
        valueSignal: v > 4 ? 'bearish' : v > 3 ? 'bearish' : v < 1 ? 'bearish' : 'neutral',
        valueText: v > 4 ? 'High inflation — erodes purchasing power, gold hedge territory'
          : v > 3 ? 'Above target — keeps Fed restrictive, headwind for stocks'
          : v < 1 ? 'Deflation risk — recessionary signal'
          : 'Near target — stable',
        trendSignal: 'neutral',
        trendText: 'Monthly release with ~2 week lag',
        status: v > 4 ? 'elevated' : v > 3 ? 'watch' : v < 1 ? 'watch' : 'safe',
      };
    },
  },
  {
    id: 'core_cpi', fred_series: 'CPILFESL', name: 'Core CPI (Ex Food & Energy)',
    category: 'inflation', unit: '%', range_min: 0, range_max: 7, frequency: 'monthly',
    interpret: (value, prev, data) => {
      const yoy = computeYoY(data);
      const v = yoy ?? value;
      return {
        valueSignal: v > 3 ? 'bearish' : 'neutral',
        valueText: v > 3 ? 'Sticky core inflation — Fed cannot ease, persistent headwind' : 'Core inflation under control',
        trendSignal: 'neutral',
        trendText: 'Monthly release',
        status: v > 3.5 ? 'elevated' : v > 3 ? 'watch' : 'safe',
      };
    },
  },
  {
    id: 'm2', fred_series: 'M2SL', name: 'M2 Money Supply (YoY Growth)',
    category: 'inflation', unit: '%', range_min: -5, range_max: 25, frequency: 'monthly',
    interpret: (value, prev, data) => {
      const yoy = computeYoY(data);
      const v = yoy ?? 0;
      return {
        valueSignal: v < 0 ? 'bearish' : v > 8 ? 'bullish' : 'neutral',
        valueText: v < 0 ? 'M2 contracting — monetary headwind for all assets (rare, last in 2022-23)'
          : v > 8 ? 'Strong M2 growth — excess liquidity lifts asset prices'
          : 'Normal monetary growth',
        trendSignal: 'neutral',
        trendText: 'Monthly, lagged release',
        status: v < 0 ? 'elevated' : 'safe',
      };
    },
  },

  // ===== VOLATILITY =====
  {
    id: 'vix', fred_series: 'VIXCLS', name: 'VIX (Implied Volatility)',
    category: 'volatility', unit: '', range_min: 9, range_max: 80, frequency: 'daily',
    interpret: (value, prev, data) => {
      const oneMonthAgo = getValueNMonthsAgo(data, 1);
      const risingFast = oneMonthAgo !== null && value > oneMonthAgo + 5;
      return {
        valueSignal: value > 35 ? 'bearish' : value > 25 ? 'bearish' : value < 14 ? 'bullish' : 'neutral',
        valueText: value > 35 ? 'Panic — acute fear in markets'
          : value > 25 ? 'Fear zone — risk-off regime'
          : value < 14 ? 'Complacency — low vol, ride the trend'
          : 'Moderate — above median but below fear threshold',
        trendSignal: risingFast ? 'bearish' : 'neutral',
        trendText: oneMonthAgo !== null
          ? `Was ${oneMonthAgo.toFixed(1)} one month ago${risingFast ? ' — rising fast' : ''}`
          : 'Insufficient history',
        status: value > 35 ? 'critical' : value > 25 ? 'elevated' : value > 20 ? 'watch' : 'safe',
      };
    },
  },

  // ===== LIQUIDITY =====
  {
    id: 'fed_balance_sheet', fred_series: 'WALCL', name: 'Fed Balance Sheet (Total Assets)',
    category: 'liquidity', unit: '$M', range_min: 4000000, range_max: 9000000, invert_gradient: true, frequency: 'weekly',
    interpret: (value, prev, data) => {
      const yearAgo = getValueNMonthsAgo(data, 12);
      const contracting = yearAgo !== null && value < yearAgo;
      return {
        valueSignal: contracting ? 'bearish' : 'bullish',
        valueText: contracting ? 'QT ongoing — liquidity drain is a headwind for risk assets'
          : 'Balance sheet expanding — QE supports asset prices',
        trendSignal: contracting ? 'neutral' : 'bullish',
        trendText: contracting ? 'Contracting via QT' : 'Expanding',
        status: contracting ? 'watch' : 'safe',
      };
    },
  },
  {
    id: 'reverse_repo', fred_series: 'RRPONTSYD', name: 'Reverse Repo Facility',
    category: 'liquidity', unit: '$B', range_min: 0, range_max: 2500000, frequency: 'daily',
    interpret: (value) => ({
      valueSignal: value > 1000000 ? 'bearish' : 'neutral',
      valueText: value > 1000000 ? 'Excess liquidity parked at Fed — not flowing into markets' : 'Draining into markets — supportive for risk assets',
      trendSignal: 'neutral',
      trendText: 'Daily update',
      status: value > 1000000 ? 'watch' : 'safe',
    }),
  },
  {
    id: 'consumer_sentiment', fred_series: 'UMCSENT', name: 'Consumer Sentiment (Michigan)',
    category: 'labor', unit: '', range_min: 40, range_max: 110, frequency: 'monthly',
    interpret: (value) => ({
      valueSignal: value < 60 ? 'bearish' : value > 90 ? 'bullish' : 'neutral',
      valueText: value < 60 ? 'Very pessimistic — consumer pullback risk' : value > 90 ? 'Optimistic — supports spending' : 'Moderate sentiment',
      trendSignal: 'neutral',
      trendText: 'Monthly survey',
      status: value < 55 ? 'elevated' : value < 65 ? 'watch' : 'safe',
    }),
  },
  {
    id: 'recession_prob', fred_series: 'RECPROUSM156N', name: 'Smoothed Recession Probability',
    category: 'labor', unit: '%', range_min: 0, range_max: 100, frequency: 'monthly',
    interpret: (value) => ({
      valueSignal: value > 30 ? 'bearish' : value > 10 ? 'bearish' : 'neutral',
      valueText: value > 30 ? 'High recession probability — defensive positioning warranted'
        : value > 10 ? 'Elevated probability — recession risk rising'
        : 'Low recession probability',
      trendSignal: value > 10 ? 'bearish' : 'neutral',
      trendText: value > 10 ? 'Probability rising' : 'Low',
      status: value > 30 ? 'critical' : value > 10 ? 'watch' : 'safe',
    }),
  },
];

// ===== HELPER FUNCTIONS =====

function getValueNMonthsAgo(data: FredRow[], months: number): number | null {
  if (!data || data.length < 2) return null;
  const latest = new Date(data[data.length - 1].date);
  const target = new Date(latest);
  target.setMonth(target.getMonth() - months);

  let closest: FredRow | null = null;
  let closestDiff = Infinity;
  for (const row of data) {
    const d = new Date(row.date);
    const diff = Math.abs(d.getTime() - target.getTime());
    if (diff < closestDiff) {
      closestDiff = diff;
      closest = row;
    }
  }
  return closest ? closest.value : null;
}

function getTrendSignal(data: FredRow[], currentValue: number, monthsBack: number, invertDirection = false): SignalDirection {
  const prev = getValueNMonthsAgo(data, monthsBack);
  if (prev === null) return 'neutral';
  const diff = currentValue - prev;
  const threshold = Math.abs(prev) * 0.05 || 0.1;

  if (Math.abs(diff) < threshold) return 'neutral';
  const rising = diff > 0;
  if (invertDirection) return rising ? 'bearish' : 'bullish';
  return rising ? 'bearish' : 'bullish';
}

function getTrendText(data: FredRow[], monthsBack: number): string {
  if (!data || data.length < 2) return 'Insufficient data';
  const latest = data[data.length - 1];
  const prev = getValueNMonthsAgo(data, monthsBack);
  if (prev === null) return 'Insufficient history';
  const diff = latest.value - prev;
  const period = monthsBack === 1 ? 'one month' : `${monthsBack} months`;
  return `Was ${prev.toFixed(2)} ${period} ago (${diff > 0 ? '+' : ''}${diff.toFixed(2)})`;
}

function computeYoY(data: FredRow[]): number | null {
  if (!data || data.length < 13) return null;
  const latest = data[data.length - 1].value;
  const yearAgo = getValueNMonthsAgo(data, 12);
  if (yearAgo === null || yearAgo === 0) return null;
  return ((latest - yearAgo) / yearAgo) * 100;
}

// Build indicator snapshots from raw data
export function buildIndicatorSnapshots(
  fredData: Record<string, FredRow[]>,
  metadata: { series_id: string; last_updated: string }[]
): IndicatorSnapshot[] {
  return INDICATOR_CONFIGS.map(config => {
    const series = config.fred_series;
    if (!series) return null;

    const data = fredData[series] || [];
    if (data.length === 0) return null;

    const latest = data[data.length - 1];
    const prev = data.length > 1 ? data[data.length - 2] : null;
    const meta = metadata.find(m => m.series_id === series);
    const lastUpdated = meta?.last_updated || latest.date;
    const freshness = computeFreshness(lastUpdated);

    const interpretation = config.interpret(latest.value, prev?.value ?? null, data);

    const range = config.range_max - config.range_min;
    const gradientPosition = range > 0 ? Math.max(0, Math.min(100, ((latest.value - config.range_min) / range) * 100)) : 50;

    return {
      id: config.id,
      name: config.name,
      category: config.category,
      series_id: series,
      current_value: latest.value,
      prev_value: prev?.value ?? null,
      value_signal: interpretation.valueSignal,
      value_text: interpretation.valueText,
      trend_signal: interpretation.trendSignal,
      trend_text: interpretation.trendText,
      status: interpretation.status,
      freshness,
      last_updated: lastUpdated,
      range_min: config.range_min,
      range_max: config.range_max,
      gradient_position: gradientPosition,
      invert_gradient: config.invert_gradient || false,
    } as IndicatorSnapshot;
  }).filter((s): s is IndicatorSnapshot => s !== null);
}
