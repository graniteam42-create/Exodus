import type { RuleDefinition, MarketData } from '../../types';
import {
  getFredValue,
  getFredValueNMonthsAgo,
  getFredChangeOverMonths,
} from './helpers';

const categoryB: RuleDefinition[] = [
  {
    id: 'B1',
    category: 'B',
    name: 'HY spreads elevated',
    condition: 'ICE BofA HY OAS > 500bp',
    asset: 'GLD',
    thesis: 'Credit stress -> risk off',
    evaluate: (data: MarketData, date: string): boolean => {
      // BAMLH0A0HYM2 is in percentage points, so 500bp = 5.0
      const spread = getFredValue(data, 'BAMLH0A0HYM2', date);
      if (spread === null) return false;
      return spread > 5.0;
    },
  },
  {
    id: 'B2',
    category: 'B',
    name: 'HY spreads blowing out',
    condition: 'HY spread up 200bp+ in 3 months',
    asset: 'Cash',
    thesis: 'Acute credit crisis developing',
    evaluate: (data: MarketData, date: string): boolean => {
      const change = getFredChangeOverMonths(data, 'BAMLH0A0HYM2', date, 3);
      if (change === null) return false;
      return change >= 2.0; // 200bp = 2.0 percentage points
    },
  },
  {
    id: 'B3',
    category: 'B',
    name: 'HY spreads compressing',
    condition: 'HY spread down 100bp+ in 3 months from elevated level',
    asset: 'QQQ',
    thesis: 'Credit healing -> risk on recovery',
    evaluate: (data: MarketData, date: string): boolean => {
      const current = getFredValue(data, 'BAMLH0A0HYM2', date);
      const past = getFredValueNMonthsAgo(data, 'BAMLH0A0HYM2', date, 3);
      if (current === null || past === null) return false;
      // Was elevated (>4.0 = 400bp) and declined by 100bp+
      return past > 4.0 && (past - current) >= 1.0;
    },
  },
  {
    id: 'B4',
    category: 'B',
    name: 'HY spreads very tight',
    condition: 'HY spread < 300bp',
    asset: 'QQQ',
    thesis: 'Risk appetite high, ride it',
    evaluate: (data: MarketData, date: string): boolean => {
      const spread = getFredValue(data, 'BAMLH0A0HYM2', date);
      if (spread === null) return false;
      return spread < 3.0;
    },
  },
  {
    id: 'B5',
    category: 'B',
    name: 'HY spreads extremely tight',
    condition: 'HY spread < 250bp',
    asset: 'Cash',
    thesis: 'Excessive complacency -> late cycle risk. Only reached in May 2007, July 2021, and November 2024.',
    evaluate: (data: MarketData, date: string): boolean => {
      const spread = getFredValue(data, 'BAMLH0A0HYM2', date);
      if (spread === null) return false;
      return spread < 2.5;
    },
  },
  {
    id: 'B6',
    category: 'B',
    name: 'Financial conditions tightening',
    condition: 'Chicago Fed NFCI rising above 0',
    asset: 'Cash',
    thesis: 'Tight financial conditions choke growth',
    evaluate: (data: MarketData, date: string): boolean => {
      const nfci = getFredValue(data, 'NFCI', date);
      if (nfci === null) return false;
      return nfci > 0;
    },
  },
  {
    id: 'B7',
    category: 'B',
    name: 'Financial conditions loosening',
    condition: 'NFCI falling below -0.5',
    asset: 'QQQ',
    thesis: 'Easy conditions = risk on',
    evaluate: (data: MarketData, date: string): boolean => {
      const nfci = getFredValue(data, 'NFCI', date);
      if (nfci === null) return false;
      return nfci < -0.5;
    },
  },
  // B8 removed: TEDRATE (TED spread) discontinued on FRED in 2022
  {
    id: 'B9',
    category: 'B',
    name: 'Credit spread acceleration',
    condition: 'HY spread rate of change > 20% in 1 month',
    asset: 'GLD',
    thesis: 'Rapid deterioration',
    evaluate: (data: MarketData, date: string): boolean => {
      const current = getFredValue(data, 'BAMLH0A0HYM2', date);
      const past = getFredValueNMonthsAgo(data, 'BAMLH0A0HYM2', date, 1);
      if (current === null || past === null || past === 0) return false;
      return (current - past) / past > 0.20;
    },
  },
  {
    id: 'B10',
    category: 'B',
    name: 'IG-to-HY differential widening',
    condition: 'HY minus IG spread widening > 100bp in 3 months',
    asset: 'Cash',
    thesis: 'Flight to quality within credit',
    evaluate: (data: MarketData, date: string): boolean => {
      // Use HY spread as proxy (IG spread data may not be in our FRED set)
      // If we had IG data, we'd compute the differential. Approximate using HY change alone
      // as HY widening faster than IG during stress is captured by HY acceleration.
      const change = getFredChangeOverMonths(data, 'BAMLH0A0HYM2', date, 3);
      if (change === null) return false;
      return change >= 1.0; // 100bp widening in HY
    },
  },
  {
    id: 'B11',
    category: 'B',
    name: 'Bank lending tightening',
    condition: 'SLOOS net tightening > 30%',
    asset: 'GLD',
    thesis: 'Banks pulling back -> recession risk',
    evaluate: (data: MarketData, date: string): boolean => {
      const val = getFredValue(data, 'DRTSCILM', date);
      if (val === null) return false;
      return val > 30;
    },
  },
  {
    id: 'B12',
    category: 'B',
    name: 'Bank lending easing',
    condition: 'SLOOS net tightening < 0%',
    asset: 'QQQ',
    thesis: 'Credit expansion -> growth',
    evaluate: (data: MarketData, date: string): boolean => {
      const val = getFredValue(data, 'DRTSCILM', date);
      if (val === null) return false;
      return val < 0;
    },
  },
];

export default categoryB;
