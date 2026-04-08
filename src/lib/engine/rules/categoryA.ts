import type { RuleDefinition, MarketData } from '../../types';
import {
  getFredValue,
  getFredValueNMonthsAgo,
  getFredChangeOverMonths,
  getRecentFredRows,
  isFredRisingForMonths,
} from './helpers';

const categoryA: RuleDefinition[] = [
  {
    id: 'A1',
    category: 'A',
    name: 'Yield curve inversion',
    condition: '10Y-2Y spread < 0',
    asset: 'GLD',
    thesis: 'Recession signal -> risk off, gold benefits',
    evaluate: (data: MarketData, date: string): boolean => {
      const spread = getFredValue(data, 'T10Y2Y', date);
      if (spread === null) return false;
      return spread < 0;
    },
  },
  {
    id: 'A2',
    category: 'A',
    name: 'Yield curve deep inversion',
    condition: '10Y-2Y spread < -0.5%',
    asset: 'Cash',
    thesis: 'Deep inversion = recession imminent, preserve capital',
    evaluate: (data: MarketData, date: string): boolean => {
      const spread = getFredValue(data, 'T10Y2Y', date);
      if (spread === null) return false;
      return spread < -0.5;
    },
  },
  {
    id: 'A3',
    category: 'A',
    name: 'Yield curve steepening from inversion',
    condition: '10Y-2Y was negative, now rising for 3+ months',
    asset: 'QQQ',
    thesis: 'Steepening after inversion = early recovery. Recessions historically begin AFTER the curve steepens back.',
    evaluate: (data: MarketData, date: string): boolean => {
      const current = getFredValue(data, 'T10Y2Y', date);
      if (current === null) return false;

      // Was negative 3 months ago
      const past3m = getFredValueNMonthsAgo(data, 'T10Y2Y', date, 3);
      if (past3m === null || past3m >= 0) return false;

      // Rising for 3 months: check each month is higher than previous
      return isFredRisingForMonths(data, 'T10Y2Y', date, 3);
    },
  },
  {
    id: 'A4',
    category: 'A',
    name: 'Yield curve bull steepening',
    condition: '10Y falling faster than 2Y',
    asset: 'GLD',
    thesis: 'Flight to safety driving long rates down',
    evaluate: (data: MarketData, date: string): boolean => {
      const dgs10Now = getFredValue(data, 'DGS10', date);
      const dgs10Past = getFredValueNMonthsAgo(data, 'DGS10', date, 3);
      const dgs2Now = getFredValue(data, 'DGS2', date);
      const dgs2Past = getFredValueNMonthsAgo(data, 'DGS2', date, 3);
      if (dgs10Now === null || dgs10Past === null || dgs2Now === null || dgs2Past === null) return false;

      const change10 = dgs10Now - dgs10Past;
      const change2 = dgs2Now - dgs2Past;
      // Bull steepening: both falling, but 10Y falling more (or 2Y rising while 10Y falling)
      // The spread is widening because 10Y drops faster
      return change10 < change2 && change10 < 0;
    },
  },
  {
    id: 'A5',
    category: 'A',
    name: 'Yield curve bear steepening',
    condition: '10Y rising faster than 2Y',
    asset: 'GLD',
    thesis: 'Fiscal concerns, inflation fears -> gold',
    evaluate: (data: MarketData, date: string): boolean => {
      const dgs10Now = getFredValue(data, 'DGS10', date);
      const dgs10Past = getFredValueNMonthsAgo(data, 'DGS10', date, 3);
      const dgs2Now = getFredValue(data, 'DGS2', date);
      const dgs2Past = getFredValueNMonthsAgo(data, 'DGS2', date, 3);
      if (dgs10Now === null || dgs10Past === null || dgs2Now === null || dgs2Past === null) return false;

      const change10 = dgs10Now - dgs10Past;
      const change2 = dgs2Now - dgs2Past;
      // Bear steepening: 10Y rising faster than 2Y
      return change10 > change2 && change10 > 0;
    },
  },
  {
    id: 'A6',
    category: 'A',
    name: 'Fed cutting cycle begins',
    condition: 'Fed funds rate drops 25bp+ from cycle peak',
    asset: 'GLD',
    thesis: 'Easing = real rates declining -> gold positive. Gold +15.5% in 12 months if recession follows the cut.',
    evaluate: (data: MarketData, date: string): boolean => {
      const current = getFredValue(data, 'FEDFUNDS', date);
      // Look for max in last 12 months as cycle peak
      const rows = getRecentFredRows(data, 'FEDFUNDS', date, 12);
      if (current === null || !rows || rows.length < 2) return false;
      const peak = Math.max(...rows.map(r => r.value));
      return (peak - current) >= 0.25;
    },
  },
  {
    id: 'A7',
    category: 'A',
    name: 'Fed aggressive cutting',
    condition: 'Fed funds rate down 100bp+ in 6 months',
    asset: 'QQQ',
    thesis: 'Aggressive easing = bottom may be near for risk assets',
    evaluate: (data: MarketData, date: string): boolean => {
      const change = getFredChangeOverMonths(data, 'FEDFUNDS', date, 6);
      if (change === null) return false;
      return change <= -1.0;
    },
  },
  {
    id: 'A8',
    category: 'A',
    name: 'Fed hiking cycle',
    condition: 'Fed funds rate up 50bp+ in 6 months',
    asset: 'Cash',
    thesis: 'Tightening headwind for all assets',
    evaluate: (data: MarketData, date: string): boolean => {
      const change = getFredChangeOverMonths(data, 'FEDFUNDS', date, 6);
      if (change === null) return false;
      return change >= 0.5;
    },
  },
  {
    id: 'A9',
    category: 'A',
    name: 'Fed on hold after hiking',
    condition: 'Fed funds unchanged 6+ months after hikes',
    asset: 'QQQ',
    thesis: 'Pause before cuts historically bullish for equities (+14.2% avg 12mo return since 1984)',
    evaluate: (data: MarketData, date: string): boolean => {
      const rows = getRecentFredRows(data, 'FEDFUNDS', date, 12);
      if (!rows || rows.length < 12) return false;

      const current = rows[rows.length - 1].value;
      // Check last 6 months stable (within 0.1)
      const last6 = rows.slice(-6);
      const stable = last6.every(r => Math.abs(r.value - current) < 0.1);
      if (!stable) return false;

      // Check that rates rose in the 6 months before that
      const earlier = rows.slice(0, 6);
      const wasHiking = earlier[earlier.length - 1].value > earlier[0].value + 0.25;
      return wasHiking;
    },
  },
  {
    id: 'A10',
    category: 'A',
    name: 'Real yields deeply negative',
    condition: '10Y TIPS yield < -1%',
    asset: 'GLD',
    thesis: 'Bonds losing purchasing power -> gold alternative. Correlation between real rates and gold is -0.82.',
    evaluate: (data: MarketData, date: string): boolean => {
      const realYield = getFredValue(data, 'DFII10', date);
      if (realYield === null) return false;
      return realYield < -1.0;
    },
  },
  {
    id: 'A11',
    category: 'A',
    name: 'Real yields rising sharply',
    condition: '10Y TIPS yield up 100bp+ in 6 months',
    asset: 'Cash',
    thesis: 'Rising real yields = headwind for gold and stocks. Each 100bp rise -> ~18% decline in inflation-adjusted gold.',
    evaluate: (data: MarketData, date: string): boolean => {
      const change = getFredChangeOverMonths(data, 'DFII10', date, 6);
      if (change === null) return false;
      return change >= 1.0;
    },
  },
  {
    id: 'A12',
    category: 'A',
    name: 'Real yields positive and high',
    condition: '10Y TIPS yield > 2%',
    asset: 'Cash',
    thesis: 'Cash competitive when real yields are high',
    evaluate: (data: MarketData, date: string): boolean => {
      const realYield = getFredValue(data, 'DFII10', date);
      if (realYield === null) return false;
      return realYield > 2.0;
    },
  },
  {
    id: 'A13',
    category: 'A',
    name: '3M-10Y inversion',
    condition: '3M yield > 10Y yield',
    asset: 'GLD',
    thesis: 'Strongest academic recession predictor (NY Fed model, Estrella & Mishkin)',
    evaluate: (data: MarketData, date: string): boolean => {
      const spread = getFredValue(data, 'T10Y3M', date);
      if (spread === null) return false;
      return spread < 0;
    },
  },
  {
    id: 'A14',
    category: 'A',
    name: 'Rate of yield curve change',
    condition: '10Y-2Y spread falling > 50bp in 3 months',
    asset: 'GLD',
    thesis: 'Rapid flattening = deteriorating outlook',
    evaluate: (data: MarketData, date: string): boolean => {
      const change = getFredChangeOverMonths(data, 'T10Y2Y', date, 3);
      if (change === null) return false;
      return change <= -0.5;
    },
  },
  {
    id: 'A15',
    category: 'A',
    name: 'Long rates collapsing',
    condition: '10Y yield down 100bp+ in 3 months',
    asset: 'GLD',
    thesis: 'Flight to safety in progress',
    evaluate: (data: MarketData, date: string): boolean => {
      const change = getFredChangeOverMonths(data, 'DGS10', date, 3);
      if (change === null) return false;
      return change <= -1.0;
    },
  },
];

export default categoryA;
