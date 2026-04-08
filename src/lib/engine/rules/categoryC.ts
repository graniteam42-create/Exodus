import type { RuleDefinition, MarketData } from '../../types';
import {
  getFredValue,
  getFredValueNMonthsAgo,
  getFredMinOverMonths,
  getFredMaxOverMonths,
  getFred4WeekAvg,
  getFred4WeekAvgMinOverWeeks,
  getFred4WeekAvgMaxOverWeeks,
  getRecentFredRows,
  isFredAboveForMonths,
} from './helpers';

const categoryC: RuleDefinition[] = [
  {
    id: 'C1',
    category: 'C',
    name: 'Unemployment rising',
    condition: 'Unemployment rate up 0.5%+ from 12-month low',
    asset: 'GLD',
    thesis: 'Sahm Rule trigger area -> recession',
    evaluate: (data: MarketData, date: string): boolean => {
      const current = getFredValue(data, 'UNRATE', date);
      const low12m = getFredMinOverMonths(data, 'UNRATE', date, 12);
      if (current === null || low12m === null) return false;
      return (current - low12m) >= 0.5;
    },
  },
  {
    id: 'C2',
    category: 'C',
    name: 'Unemployment rising fast',
    condition: 'Unemployment up 1%+ from cycle low',
    asset: 'Cash',
    thesis: 'Deep recession underway',
    evaluate: (data: MarketData, date: string): boolean => {
      const current = getFredValue(data, 'UNRATE', date);
      // Use 24-month lookback as proxy for cycle low
      const low = getFredMinOverMonths(data, 'UNRATE', date, 24);
      if (current === null || low === null) return false;
      return (current - low) >= 1.0;
    },
  },
  {
    id: 'C3',
    category: 'C',
    name: 'Unemployment falling steadily',
    condition: 'Unemployment down 3+ consecutive months',
    asset: 'QQQ',
    thesis: 'Labor market strength = growth',
    evaluate: (data: MarketData, date: string): boolean => {
      const rows = getRecentFredRows(data, 'UNRATE', date, 4);
      if (!rows || rows.length < 4) return false;
      // Each month lower than previous
      for (let i = 1; i < rows.length; i++) {
        if (rows[i].value >= rows[i - 1].value) return false;
      }
      return true;
    },
  },
  {
    id: 'C4',
    category: 'C',
    name: 'Initial claims surging',
    condition: '4-week avg initial claims up 30%+ from low',
    asset: 'GLD',
    thesis: 'Leading labor indicator, recession warning',
    evaluate: (data: MarketData, date: string): boolean => {
      const avg = getFred4WeekAvg(data, 'ICSA', date);
      // Look back ~26 weeks for the low
      const minAvg = getFred4WeekAvgMinOverWeeks(data, 'ICSA', date, 26);
      if (avg === null || minAvg === null || minAvg === 0) return false;
      return (avg - minAvg) / minAvg >= 0.30;
    },
  },
  {
    id: 'C5',
    category: 'C',
    name: 'Initial claims falling from peak',
    condition: '4-week avg claims down 20%+ from recent peak',
    asset: 'QQQ',
    thesis: 'Recovery in progress',
    evaluate: (data: MarketData, date: string): boolean => {
      const avg = getFred4WeekAvg(data, 'ICSA', date);
      const maxAvg = getFred4WeekAvgMaxOverWeeks(data, 'ICSA', date, 26);
      if (avg === null || maxAvg === null || maxAvg === 0) return false;
      return (maxAvg - avg) / maxAvg >= 0.20;
    },
  },
  {
    id: 'C6',
    category: 'C',
    name: 'Continuing claims surging',
    condition: 'Continuing claims up 20%+ from 6-month low',
    asset: 'GLD',
    thesis: 'Persistent layoffs, recession deepening',
    evaluate: (data: MarketData, date: string): boolean => {
      const current = getFredValue(data, 'CCSA', date);
      const low = getFredMinOverMonths(data, 'CCSA', date, 26); // ~6 months of weekly data
      if (current === null || low === null || low === 0) return false;
      return (current - low) / low >= 0.20;
    },
  },
  {
    id: 'C7',
    category: 'C',
    name: 'Sahm Rule triggered',
    condition: '3-month avg unemployment 0.5%+ above 12-month low',
    asset: 'Cash',
    thesis: 'Historically 100% recession accuracy since 1950, triggers ~3 months into recession',
    evaluate: (data: MarketData, date: string): boolean => {
      // Use the dedicated SAHMREALTIME series
      const sahm = getFredValue(data, 'SAHMREALTIME', date);
      if (sahm !== null) return sahm >= 0.5;

      // Fallback: compute manually from UNRATE
      const rows = getRecentFredRows(data, 'UNRATE', date, 12);
      if (!rows || rows.length < 12) return false;
      const last3 = rows.slice(-3);
      const avg3m = last3.reduce((s, r) => s + r.value, 0) / 3;
      const low12m = Math.min(...rows.map(r => r.value));
      return (avg3m - low12m) >= 0.5;
    },
  },
  {
    id: 'C8',
    category: 'C',
    name: 'Employment plateau',
    condition: 'Unemployment flat within 0.1% for 6+ months at low level',
    asset: 'QQQ',
    thesis: 'Goldilocks labor market',
    evaluate: (data: MarketData, date: string): boolean => {
      const rows = getRecentFredRows(data, 'UNRATE', date, 6);
      if (!rows || rows.length < 6) return false;
      const current = rows[rows.length - 1].value;
      // Low level: below 5%
      if (current >= 5.0) return false;
      // All within 0.1 of each other
      const min = Math.min(...rows.map(r => r.value));
      const max = Math.max(...rows.map(r => r.value));
      return (max - min) <= 0.1;
    },
  },
  {
    id: 'C9',
    category: 'C',
    name: 'Claims vs unemployment divergence',
    condition: 'Initial claims rising but unemployment still low',
    asset: 'GLD',
    thesis: 'Early warning before unemployment confirms',
    evaluate: (data: MarketData, date: string): boolean => {
      // Claims rising: current 4-week avg > avg from 3 months ago by 15%+
      const avgNow = getFred4WeekAvg(data, 'ICSA', date);
      const minRecent = getFred4WeekAvgMinOverWeeks(data, 'ICSA', date, 13);
      const unrate = getFredValue(data, 'UNRATE', date);
      if (avgNow === null || minRecent === null || minRecent === 0 || unrate === null) return false;
      const claimsRising = (avgNow - minRecent) / minRecent >= 0.15;
      const lowUnemployment = unrate < 4.5;
      return claimsRising && lowUnemployment;
    },
  },
  {
    id: 'C10',
    category: 'C',
    name: 'Unemployment rate above 5%',
    condition: 'Unemployment > 5%',
    asset: 'Cash',
    thesis: 'Significant slack -> deflationary, defensive',
    evaluate: (data: MarketData, date: string): boolean => {
      const unrate = getFredValue(data, 'UNRATE', date);
      if (unrate === null) return false;
      return unrate > 5.0;
    },
  },
];

export default categoryC;
