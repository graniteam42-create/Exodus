import type { RuleDefinition, MarketData } from '../../types';
import {
  getFredValue,
  getFredValueNMonthsAgo,
  getPrice,
  getSMA,
  getRealizedVol,
  getCorrelation,
  getRecentFredRows,
  getDateIndex,
} from './helpers';

/** Helper: check if VIX has been below threshold for N+ consecutive trading days */
function vixBelowForDays(data: MarketData, date: string, threshold: number, days: number): boolean {
  const rows = data.fred['VIXCLS'];
  if (!rows || rows.length === 0) return false;

  // Find index at or before date
  let idx = rows.length - 1;
  while (idx >= 0 && rows[idx].date > date) idx--;
  if (idx < days - 1) return false;

  for (let i = idx - days + 1; i <= idx; i++) {
    if (rows[i].value >= threshold) return false;
  }
  return true;
}

/** Helper: check if VIX was above threshold recently and is now below target */
function vixDeclinedFrom(data: MarketData, date: string, fromAbove: number, toBelow: number, lookbackDays: number): boolean {
  const rows = data.fred['VIXCLS'];
  if (!rows || rows.length === 0) return false;

  let idx = rows.length - 1;
  while (idx >= 0 && rows[idx].date > date) idx--;
  if (idx < lookbackDays) return false;

  const current = rows[idx].value;
  if (current >= toBelow) return false;

  // Check if VIX was above fromAbove in the lookback period
  for (let i = idx - lookbackDays; i < idx; i++) {
    if (rows[i].value > fromAbove) return true;
  }
  return false;
}

const categoryE: RuleDefinition[] = [
  {
    id: 'E1',
    category: 'E',
    name: 'VIX low complacency',
    condition: 'VIX < 14 for 20+ days',
    asset: 'QQQ',
    thesis: 'Low vol regime, ride the trend',
    evaluate: (data: MarketData, date: string): boolean => {
      return vixBelowForDays(data, date, 14, 20);
    },
  },
  {
    id: 'E2',
    category: 'E',
    name: 'VIX moderately elevated',
    condition: 'VIX between 20-30',
    asset: 'GLD',
    thesis: 'Heightened uncertainty, defensive',
    evaluate: (data: MarketData, date: string): boolean => {
      const vix = getFredValue(data, 'VIXCLS', date);
      if (vix === null) return false;
      return vix >= 20 && vix <= 30;
    },
  },
  {
    id: 'E3',
    category: 'E',
    name: 'VIX panic spike',
    condition: 'VIX > 35',
    asset: 'Cash',
    thesis: 'Acute panic, wait for dust to settle',
    evaluate: (data: MarketData, date: string): boolean => {
      const vix = getFredValue(data, 'VIXCLS', date);
      if (vix === null) return false;
      return vix > 35;
    },
  },
  {
    id: 'E4',
    category: 'E',
    name: 'VIX extreme panic',
    condition: 'VIX > 45',
    asset: 'QQQ',
    thesis: 'Historically, buying extreme VIX = high forward returns (contrarian)',
    evaluate: (data: MarketData, date: string): boolean => {
      const vix = getFredValue(data, 'VIXCLS', date);
      if (vix === null) return false;
      return vix > 45;
    },
  },
  {
    id: 'E5',
    category: 'E',
    name: 'VIX declining from spike',
    condition: 'VIX was > 30, now below 25 and falling',
    asset: 'QQQ',
    thesis: 'Post-panic recovery',
    evaluate: (data: MarketData, date: string): boolean => {
      const rows = data.fred['VIXCLS'];
      if (!rows || rows.length === 0) return false;

      let idx = rows.length - 1;
      while (idx >= 0 && rows[idx].date > date) idx--;
      if (idx < 20) return false;

      const current = rows[idx].value;
      if (current >= 25) return false;

      // Check VIX is falling (current < 5 days ago)
      if (idx >= 5 && rows[idx - 5].value <= current) return false;

      // Check was > 30 in last 20 trading days
      for (let i = idx - 20; i < idx; i++) {
        if (rows[i].value > 30) return true;
      }
      return false;
    },
  },
  {
    id: 'E6',
    category: 'E',
    name: 'VIX term structure inverted',
    condition: 'Front-month VIX > next-month VIX',
    asset: 'Cash',
    thesis: 'Market expects near-term turbulence (~20% of time, signals acute stress)',
    evaluate: (data: MarketData, date: string): boolean => {
      // Without VIX futures data, approximate: VIX > 20-day SMA of VIX by 15%+
      // (spot VIX spikes above term structure in backwardation)
      const rows = data.fred['VIXCLS'];
      if (!rows || rows.length === 0) return false;
      let idx = rows.length - 1;
      while (idx >= 0 && rows[idx].date > date) idx--;
      if (idx < 20) return false;

      const current = rows[idx].value;
      let sum = 0;
      for (let i = idx - 19; i <= idx; i++) sum += rows[i].value;
      const sma20 = sum / 20;

      // Backwardation proxy: spot VIX significantly above its recent average
      return current > sma20 * 1.15;
    },
  },
  {
    id: 'E7',
    category: 'E',
    name: 'VIX term structure backwardation prolonged',
    condition: 'Inverted for 5+ days',
    asset: 'GLD',
    thesis: 'Sustained fear, not just a spike',
    evaluate: (data: MarketData, date: string): boolean => {
      const rows = data.fred['VIXCLS'];
      if (!rows || rows.length === 0) return false;
      let idx = rows.length - 1;
      while (idx >= 0 && rows[idx].date > date) idx--;
      if (idx < 25) return false;

      // Check if VIX has been > 20-day SMA by 15% for 5+ consecutive days
      let consecutiveDays = 0;
      for (let d = idx; d >= idx - 10 && d >= 20; d--) {
        let sum = 0;
        for (let i = d - 19; i <= d; i++) sum += rows[i].value;
        const sma = sum / 20;
        if (rows[d].value > sma * 1.15) {
          consecutiveDays++;
        } else {
          break;
        }
      }
      return consecutiveDays >= 5;
    },
  },
  {
    id: 'E8',
    category: 'E',
    name: 'VIX term structure contango steep',
    condition: 'Front/next month ratio < 0.85',
    asset: 'QQQ',
    thesis: 'Markets expect calm, risk on',
    evaluate: (data: MarketData, date: string): boolean => {
      // Proxy: VIX well below its 20-day SMA (steep contango = spot low relative to future)
      const rows = data.fred['VIXCLS'];
      if (!rows || rows.length === 0) return false;
      let idx = rows.length - 1;
      while (idx >= 0 && rows[idx].date > date) idx--;
      if (idx < 20) return false;

      const current = rows[idx].value;
      let sum = 0;
      for (let i = idx - 19; i <= idx; i++) sum += rows[i].value;
      const sma20 = sum / 20;

      return current < sma20 * 0.85;
    },
  },
  {
    id: 'E9',
    category: 'E',
    name: 'Realized vol > implied vol',
    condition: '20-day realized vol > VIX',
    asset: 'Cash',
    thesis: 'Market underpricing actual risk',
    evaluate: (data: MarketData, date: string): boolean => {
      const vix = getFredValue(data, 'VIXCLS', date);
      const realVol = getRealizedVol(data, 'SPY', date, 20);
      if (vix === null || realVol === null) return false;
      return realVol > vix;
    },
  },
  {
    id: 'E10',
    category: 'E',
    name: 'VVIX elevated',
    condition: 'VVIX > 120 (if available)',
    asset: 'Cash',
    thesis: 'Volatility of volatility = extreme uncertainty. VVIX >= 125 correlates with positive QQQ returns 70%+ of the time.',
    evaluate: (data: MarketData, date: string): boolean => {
      // VVIX may not be in our dataset. If available from FRED or computed:
      const vvix = getFredValue(data, 'VVIX', date);
      if (vvix !== null) return vvix > 120;

      // Fallback: use VIX realized vol as proxy for vol-of-vol
      const rows = data.fred['VIXCLS'];
      if (!rows || rows.length === 0) return false;
      let idx = rows.length - 1;
      while (idx >= 0 && rows[idx].date > date) idx--;
      if (idx < 20) return false;

      // Compute std dev of VIX over last 20 days, annualize
      const vixVals: number[] = [];
      for (let i = idx - 19; i <= idx; i++) vixVals.push(rows[i].value);
      const mean = vixVals.reduce((a, b) => a + b, 0) / vixVals.length;
      const variance = vixVals.reduce((a, v) => a + (v - mean) ** 2, 0) / (vixVals.length - 1);
      const annualizedVolOfVol = Math.sqrt(variance) * Math.sqrt(252) / mean * 100;
      return annualizedVolOfVol > 120;
    },
  },
  {
    id: 'E11',
    category: 'E',
    name: 'Volatility regime shift',
    condition: 'VIX 20-day average crosses above 50-day average',
    asset: 'GLD',
    thesis: 'Transitioning to higher vol regime',
    evaluate: (data: MarketData, date: string): boolean => {
      const rows = data.fred['VIXCLS'];
      if (!rows || rows.length === 0) return false;
      let idx = rows.length - 1;
      while (idx >= 0 && rows[idx].date > date) idx--;
      if (idx < 50) return false;

      let sum20 = 0;
      for (let i = idx - 19; i <= idx; i++) sum20 += rows[i].value;
      const sma20 = sum20 / 20;

      let sum50 = 0;
      for (let i = idx - 49; i <= idx; i++) sum50 += rows[i].value;
      const sma50 = sum50 / 50;

      return sma20 > sma50;
    },
  },
  {
    id: 'E12',
    category: 'E',
    name: 'Gold volatility low + uptrend',
    condition: 'GLD 20-day vol < 15% AND GLD > SMA50',
    asset: 'GLD',
    thesis: 'Low vol uptrend = sustainable gold bull',
    evaluate: (data: MarketData, date: string): boolean => {
      const vol = getRealizedVol(data, 'GLD', date, 20);
      const price = getPrice(data, 'GLD', date);
      const sma50 = getSMA(data, 'GLD', date, 50);
      if (vol === null || price === null || sma50 === null) return false;
      return vol < 15 && price > sma50;
    },
  },
  {
    id: 'E13',
    category: 'E',
    name: 'QQQ volatility compression',
    condition: 'QQQ 20-day vol < 10% for 20+ days',
    asset: 'QQQ',
    thesis: 'Compressed vol often precedes continuation',
    evaluate: (data: MarketData, date: string): boolean => {
      // Check if 20-day vol has been below 10% for the last 20 trading days
      const idx = getDateIndex(data, 'QQQ', date);
      if (idx === null || idx < 40) return false;
      const prices = data.prices['QQQ'];

      for (let d = idx; d > idx - 20; d--) {
        // Compute 20-day realized vol at each point
        const returns: number[] = [];
        for (let i = d - 19; i <= d; i++) {
          if (i < 1) return false;
          const prev = prices[i - 1].adjusted_close;
          if (prev === 0) return false;
          returns.push(Math.log(prices[i].adjusted_close / prev));
        }
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (returns.length - 1);
        const annVol = Math.sqrt(variance * 252) * 100;
        if (annVol >= 10) return false;
      }
      return true;
    },
  },
  {
    id: 'E14',
    category: 'E',
    name: 'Cross-asset correlation spike',
    condition: 'GLD-QQQ rolling 20-day correlation > 0.5',
    asset: 'Cash',
    thesis: 'All correlations going to 1 = crisis ("selling everything")',
    evaluate: (data: MarketData, date: string): boolean => {
      const corr = getCorrelation(data, 'GLD', 'QQQ', date, 20);
      if (corr === null) return false;
      return corr > 0.5;
    },
  },
  {
    id: 'E15',
    category: 'E',
    name: 'Correlation breakdown',
    condition: 'GLD-QQQ correlation < -0.3',
    asset: 'GLD',
    thesis: 'Normal negative correlation = gold is hedging properly',
    evaluate: (data: MarketData, date: string): boolean => {
      const corr = getCorrelation(data, 'GLD', 'QQQ', date, 20);
      if (corr === null) return false;
      return corr < -0.3;
    },
  },
];

export default categoryE;
