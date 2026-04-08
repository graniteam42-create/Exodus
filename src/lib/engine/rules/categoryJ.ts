import type { RuleDefinition, MarketData } from '../../types';
import {
  getFredValue,
  getFredValueNMonthsAgo,
  getFredYoY,
  getFredChangeOverMonths,
  getRecentFredRows,
  getPrice,
  getSMA,
  getPriceN,
} from './helpers';

const categoryJ: RuleDefinition[] = [
  {
    id: 'J1',
    category: 'J',
    name: 'Fed balance sheet expanding',
    condition: 'Fed assets (WALCL) growing YoY > 5%',
    asset: 'QQQ',
    thesis: 'QE / liquidity injection lifts all boats',
    evaluate: (data: MarketData, date: string): boolean => {
      const yoy = getFredYoY(data, 'WALCL', date);
      if (yoy === null) return false;
      return yoy > 0.05;
    },
  },
  {
    id: 'J2',
    category: 'J',
    name: 'Fed balance sheet contracting',
    condition: 'Fed assets declining YoY (QT)',
    asset: 'Cash',
    thesis: 'Liquidity drain = headwind. QT effects are roughly DOUBLE those of QE in reverse.',
    evaluate: (data: MarketData, date: string): boolean => {
      const yoy = getFredYoY(data, 'WALCL', date);
      if (yoy === null) return false;
      return yoy < 0;
    },
  },
  {
    id: 'J3',
    category: 'J',
    name: 'Fed balance sheet expanding rapidly',
    condition: 'Fed assets growing > 20% YoY',
    asset: 'QQQ',
    thesis: 'Emergency QE, massive liquidity',
    evaluate: (data: MarketData, date: string): boolean => {
      const yoy = getFredYoY(data, 'WALCL', date);
      if (yoy === null) return false;
      return yoy > 0.20;
    },
  },
  {
    id: 'J4',
    category: 'J',
    name: 'Reverse repo draining',
    condition: 'RRP facility declining > $200B in 3 months',
    asset: 'QQQ',
    thesis: 'Liquidity flowing into risk assets',
    evaluate: (data: MarketData, date: string): boolean => {
      const current = getFredValue(data, 'RRPONTSYD', date);
      const past = getFredValueNMonthsAgo(data, 'RRPONTSYD', date, 3);
      if (current === null || past === null) return false;
      // RRP is in millions in FRED
      return (past - current) > 200000; // $200B in millions
    },
  },
  {
    id: 'J5',
    category: 'J',
    name: 'Reverse repo elevated',
    condition: 'RRP > $1T',
    asset: 'Cash',
    thesis: 'Excess liquidity parked at Fed, not in markets',
    evaluate: (data: MarketData, date: string): boolean => {
      const rrp = getFredValue(data, 'RRPONTSYD', date);
      if (rrp === null) return false;
      // RRPONTSYD is in millions
      return rrp > 1000000; // $1T in millions
    },
  },
  {
    id: 'J6',
    category: 'J',
    name: 'NFCI tightening fast',
    condition: 'NFCI up 0.5+ in 3 months',
    asset: 'Cash',
    thesis: 'Rapid financial tightening',
    evaluate: (data: MarketData, date: string): boolean => {
      const change = getFredChangeOverMonths(data, 'NFCI', date, 3);
      if (change === null) return false;
      return change >= 0.5;
    },
  },
  {
    id: 'J7',
    category: 'J',
    name: 'NFCI very loose',
    condition: 'NFCI < -0.5',
    asset: 'QQQ',
    thesis: 'Easy financial conditions favor risk',
    evaluate: (data: MarketData, date: string): boolean => {
      const nfci = getFredValue(data, 'NFCI', date);
      if (nfci === null) return false;
      return nfci < -0.5;
    },
  },
  {
    id: 'J8',
    category: 'J',
    name: 'Fed emergency action',
    condition: 'Fed funds rate cut > 50bp in single meeting',
    asset: 'QQQ',
    thesis: 'Buy when they panic (3-6 month horizon)',
    evaluate: (data: MarketData, date: string): boolean => {
      // Check if fed funds dropped > 50bp in the last month (proxy for single meeting)
      const change = getFredChangeOverMonths(data, 'FEDFUNDS', date, 1);
      if (change === null) return false;
      return change <= -0.5;
    },
  },
  {
    id: 'J9',
    category: 'J',
    name: 'Fed credibility stress',
    condition: 'Fed funds rate unchanged but 10Y rising > 50bp in 3 months',
    asset: 'GLD',
    thesis: 'Market losing confidence in Fed',
    evaluate: (data: MarketData, date: string): boolean => {
      const ffChange = getFredChangeOverMonths(data, 'FEDFUNDS', date, 3);
      const dgs10Change = getFredChangeOverMonths(data, 'DGS10', date, 3);
      if (ffChange === null || dgs10Change === null) return false;
      return Math.abs(ffChange) < 0.1 && dgs10Change > 0.5;
    },
  },
  {
    id: 'J10',
    category: 'J',
    name: 'Global central bank easing',
    condition: 'Multiple major CBs cutting rates (proxy: trend in DXY + rates)',
    asset: 'GLD',
    thesis: 'Global liquidity expansion -> gold',
    evaluate: (data: MarketData, date: string): boolean => {
      // Proxy: Fed cutting AND dollar weakening (suggests coordinated easing)
      const ffChange = getFredChangeOverMonths(data, 'FEDFUNDS', date, 6);
      const uupPrice = getPrice(data, 'UUP', date);
      const uupPast = getPriceN(data, 'UUP', date, 126);
      if (ffChange === null || uupPrice === null || uupPast === null || uupPast === 0) return false;

      const dollarWeakening = (uupPrice - uupPast) / uupPast < -0.03;
      const fedCutting = ffChange < -0.25;
      return dollarWeakening && fedCutting;
    },
  },
];

export default categoryJ;
