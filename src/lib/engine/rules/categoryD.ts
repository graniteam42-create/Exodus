import type { RuleDefinition, MarketData } from '../../types';
import {
  getFredValue,
  getFredValueNMonthsAgo,
  getFredYoY,
  getFredChangeOverMonths,
  isFredRisingForMonths,
  isFredFallingForMonths,
  isFredAboveForMonths,
  getRecentFredRows,
} from './helpers';

const categoryD: RuleDefinition[] = [
  {
    id: 'D1',
    category: 'D',
    name: 'CPI accelerating',
    condition: 'YoY CPI rising for 3+ months',
    asset: 'GLD',
    thesis: 'Inflation favors gold',
    evaluate: (data: MarketData, date: string): boolean => {
      // Compute YoY CPI for last 4 months and check it's rising for 3
      const rows = getRecentFredRows(data, 'CPIAUCSL', date, 16);
      if (!rows || rows.length < 16) return false;

      const yoyValues: number[] = [];
      for (let i = 12; i < rows.length; i++) {
        const pastVal = rows[i - 12].value;
        if (pastVal === 0) return false;
        yoyValues.push((rows[i].value - pastVal) / pastVal * 100);
      }

      if (yoyValues.length < 4) return false;
      // Check last 3 are rising
      for (let i = yoyValues.length - 3; i < yoyValues.length; i++) {
        if (yoyValues[i] <= yoyValues[i - 1]) return false;
      }
      return true;
    },
  },
  {
    id: 'D2',
    category: 'D',
    name: 'CPI above 4%',
    condition: 'YoY CPI > 4%',
    asset: 'GLD',
    thesis: 'High inflation regime, gold as store of value',
    evaluate: (data: MarketData, date: string): boolean => {
      const yoy = getFredYoY(data, 'CPIAUCSL', date);
      if (yoy === null) return false;
      return yoy > 0.04; // 4%
    },
  },
  {
    id: 'D3',
    category: 'D',
    name: 'CPI decelerating rapidly',
    condition: 'YoY CPI down 1%+ in 6 months',
    asset: 'QQQ',
    thesis: 'Disinflation = potential Fed easing = bullish equities',
    evaluate: (data: MarketData, date: string): boolean => {
      const current = getFredYoY(data, 'CPIAUCSL', date);
      // YoY CPI 6 months ago
      const rows = getRecentFredRows(data, 'CPIAUCSL', date, 19); // need 18 months back
      if (!rows || rows.length < 19 || current === null) return false;
      const past6mIdx = rows.length - 7;
      const past12mIdx = past6mIdx - 12;
      if (past12mIdx < 0) return false;
      const yoy6mAgo = (rows[past6mIdx].value - rows[past12mIdx].value) / rows[past12mIdx].value;
      return (yoy6mAgo - current) >= 0.01; // CPI YoY dropped by 1 percentage point
    },
  },
  {
    id: 'D4',
    category: 'D',
    name: 'Core CPI sticky above 3%',
    condition: 'Core CPI > 3% for 6+ months',
    asset: 'GLD',
    thesis: 'Sticky inflation erodes real returns -> gold',
    evaluate: (data: MarketData, date: string): boolean => {
      // Check YoY core CPI for last 6 months
      const rows = getRecentFredRows(data, 'CPILFESL', date, 18);
      if (!rows || rows.length < 18) return false;

      for (let i = 12; i < rows.length; i++) {
        const pastVal = rows[i - 12].value;
        if (pastVal === 0) return false;
        const yoy = (rows[i].value - pastVal) / pastVal;
        if (yoy <= 0.03) return false;
      }
      return true;
    },
  },
  {
    id: 'D5',
    category: 'D',
    name: 'Deflation risk',
    condition: 'YoY CPI < 1% and falling',
    asset: 'Cash',
    thesis: 'Deflationary bust, cash preserves',
    evaluate: (data: MarketData, date: string): boolean => {
      const yoy = getFredYoY(data, 'CPIAUCSL', date);
      if (yoy === null) return false;
      if (yoy >= 0.01) return false; // must be < 1%

      // Check if falling: current YoY < YoY from 1 month ago
      const rows = getRecentFredRows(data, 'CPIAUCSL', date, 14);
      if (!rows || rows.length < 14) return false;
      const prevYoY = (rows[rows.length - 2].value - rows[rows.length - 14].value) / rows[rows.length - 14].value;
      return yoy < prevYoY;
    },
  },
  {
    id: 'D6',
    category: 'D',
    name: 'Breakeven inflation rising',
    condition: '10Y breakeven up 50bp+ in 3 months',
    asset: 'GLD',
    thesis: 'Market pricing in more inflation -> gold',
    evaluate: (data: MarketData, date: string): boolean => {
      const change = getFredChangeOverMonths(data, 'T10YIE', date, 3);
      if (change === null) return false;
      return change >= 0.5;
    },
  },
  {
    id: 'D7',
    category: 'D',
    name: 'Breakeven inflation collapsing',
    condition: '10Y breakeven down 50bp+ in 3 months',
    asset: 'Cash',
    thesis: 'Deflation fears -> risk off',
    evaluate: (data: MarketData, date: string): boolean => {
      const change = getFredChangeOverMonths(data, 'T10YIE', date, 3);
      if (change === null) return false;
      return change <= -0.5;
    },
  },
  {
    id: 'D8',
    category: 'D',
    name: 'M2 growth strong',
    condition: 'YoY M2 growth > 8%',
    asset: 'QQQ',
    thesis: 'Excess liquidity lifts asset prices',
    evaluate: (data: MarketData, date: string): boolean => {
      const yoy = getFredYoY(data, 'M2SL', date);
      if (yoy === null) return false;
      return yoy > 0.08;
    },
  },
  {
    id: 'D9',
    category: 'D',
    name: 'M2 contraction',
    condition: 'YoY M2 growth < 0%',
    asset: 'Cash',
    thesis: 'Monetary contraction -> deflationary, bearish all assets (first occurred 2022-2023 since mid-1990s)',
    evaluate: (data: MarketData, date: string): boolean => {
      const yoy = getFredYoY(data, 'M2SL', date);
      if (yoy === null) return false;
      return yoy < 0;
    },
  },
  {
    id: 'D10',
    category: 'D',
    name: 'M2 contraction prolonged',
    condition: 'YoY M2 negative for 6+ months',
    asset: 'GLD',
    thesis: 'Extreme monetary stress, flight to hard assets',
    evaluate: (data: MarketData, date: string): boolean => {
      // Check last 6 monthly M2 readings all have negative YoY
      const rows = getRecentFredRows(data, 'M2SL', date, 18);
      if (!rows || rows.length < 18) return false;

      for (let i = 12; i < rows.length; i++) {
        const pastVal = rows[i - 12].value;
        if (pastVal === 0) return false;
        const yoy = (rows[i].value - pastVal) / pastVal;
        if (yoy >= 0) return false;
      }
      return true;
    },
  },
  {
    id: 'D11',
    category: 'D',
    name: 'PPI diverging from CPI',
    condition: 'PPI rising while CPI flat',
    asset: 'GLD',
    thesis: 'Producer costs rising = future CPI pressure',
    evaluate: (data: MarketData, date: string): boolean => {
      // PPI may not be in our FRED set. Use breakeven inflation as proxy for forward inflation expectations
      // If PPIACO is available, use it
      const ppiYoY = getFredYoY(data, 'PPIACO', date);
      const cpiYoY = getFredYoY(data, 'CPIAUCSL', date);

      if (ppiYoY !== null && cpiYoY !== null) {
        return ppiYoY > 0.03 && cpiYoY < 0.03; // PPI > 3% YoY while CPI < 3%
      }

      // Fallback: breakeven rising while CPI stable
      const beChange = getFredChangeOverMonths(data, 'T10YIE', date, 3);
      if (beChange === null || cpiYoY === null) return false;
      return beChange > 0.3 && cpiYoY < 0.03;
    },
  },
  {
    id: 'D12',
    category: 'D',
    name: 'Stagflation signal',
    condition: 'CPI > 3% AND unemployment rising',
    asset: 'GLD',
    thesis: 'Worst-case scenario for equities, gold benefits',
    evaluate: (data: MarketData, date: string): boolean => {
      const cpiYoY = getFredYoY(data, 'CPIAUCSL', date);
      const unrate = getFredValue(data, 'UNRATE', date);
      const unratePast = getFredValueNMonthsAgo(data, 'UNRATE', date, 3);
      if (cpiYoY === null || unrate === null || unratePast === null) return false;
      return cpiYoY > 0.03 && unrate > unratePast;
    },
  },
];

export default categoryD;
