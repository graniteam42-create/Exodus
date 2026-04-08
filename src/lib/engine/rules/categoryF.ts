import type { RuleDefinition, MarketData } from '../../types';
import {
  getPrice,
  getSMA,
  getReturn,
  getReturnMonths,
  getRealizedVol,
} from './helpers';

const categoryF: RuleDefinition[] = [
  {
    id: 'F1',
    category: 'F',
    name: 'GLD above 200-day SMA',
    condition: 'GLD > SMA200',
    asset: 'GLD',
    thesis: 'Long-term trend confirmation (most robust single technical indicator academically)',
    evaluate: (data: MarketData, date: string): boolean => {
      const price = getPrice(data, 'GLD', date);
      const sma = getSMA(data, 'GLD', date, 200);
      if (price === null || sma === null) return false;
      return price > sma;
    },
  },
  {
    id: 'F2',
    category: 'F',
    name: 'GLD below 200-day SMA',
    condition: 'GLD < SMA200',
    asset: 'Cash',
    thesis: 'Gold downtrend, avoid',
    evaluate: (data: MarketData, date: string): boolean => {
      const price = getPrice(data, 'GLD', date);
      const sma = getSMA(data, 'GLD', date, 200);
      if (price === null || sma === null) return false;
      return price < sma;
    },
  },
  {
    id: 'F3',
    category: 'F',
    name: 'QQQ above 200-day SMA',
    condition: 'QQQ > SMA200',
    asset: 'QQQ',
    thesis: 'Bull market confirmed',
    evaluate: (data: MarketData, date: string): boolean => {
      const price = getPrice(data, 'QQQ', date);
      const sma = getSMA(data, 'QQQ', date, 200);
      if (price === null || sma === null) return false;
      return price > sma;
    },
  },
  {
    id: 'F4',
    category: 'F',
    name: 'QQQ below 200-day SMA',
    condition: 'QQQ < SMA200',
    asset: 'Cash',
    thesis: 'Bear market, step aside',
    evaluate: (data: MarketData, date: string): boolean => {
      const price = getPrice(data, 'QQQ', date);
      const sma = getSMA(data, 'QQQ', date, 200);
      if (price === null || sma === null) return false;
      return price < sma;
    },
  },
  {
    id: 'F5',
    category: 'F',
    name: 'SLV above 200-day SMA',
    condition: 'SLV > SMA200',
    asset: 'SLV',
    thesis: 'Silver uptrend',
    evaluate: (data: MarketData, date: string): boolean => {
      const price = getPrice(data, 'SLV', date);
      const sma = getSMA(data, 'SLV', date, 200);
      if (price === null || sma === null) return false;
      return price > sma;
    },
  },
  {
    id: 'F6',
    category: 'F',
    name: 'GLD golden cross',
    condition: 'SMA50 > SMA200 (GLD)',
    asset: 'GLD',
    thesis: 'Medium-term trend turning up',
    evaluate: (data: MarketData, date: string): boolean => {
      const sma50 = getSMA(data, 'GLD', date, 50);
      const sma200 = getSMA(data, 'GLD', date, 200);
      if (sma50 === null || sma200 === null) return false;
      return sma50 > sma200;
    },
  },
  {
    id: 'F7',
    category: 'F',
    name: 'GLD death cross',
    condition: 'SMA50 < SMA200 (GLD)',
    asset: 'Cash',
    thesis: 'Medium-term trend turning down',
    evaluate: (data: MarketData, date: string): boolean => {
      const sma50 = getSMA(data, 'GLD', date, 50);
      const sma200 = getSMA(data, 'GLD', date, 200);
      if (sma50 === null || sma200 === null) return false;
      return sma50 < sma200;
    },
  },
  {
    id: 'F8',
    category: 'F',
    name: 'QQQ golden cross',
    condition: 'SMA50 > SMA200 (QQQ)',
    asset: 'QQQ',
    thesis: 'Equity uptrend confirmed',
    evaluate: (data: MarketData, date: string): boolean => {
      const sma50 = getSMA(data, 'QQQ', date, 50);
      const sma200 = getSMA(data, 'QQQ', date, 200);
      if (sma50 === null || sma200 === null) return false;
      return sma50 > sma200;
    },
  },
  {
    id: 'F9',
    category: 'F',
    name: 'QQQ death cross',
    condition: 'SMA50 < SMA200 (QQQ)',
    asset: 'Cash',
    thesis: 'Equity downtrend confirmed',
    evaluate: (data: MarketData, date: string): boolean => {
      const sma50 = getSMA(data, 'QQQ', date, 50);
      const sma200 = getSMA(data, 'QQQ', date, 200);
      if (sma50 === null || sma200 === null) return false;
      return sma50 < sma200;
    },
  },
  {
    id: 'F10',
    category: 'F',
    name: '12-month momentum GLD positive',
    condition: 'GLD 12-month return > 0%',
    asset: 'GLD',
    thesis: 'Time-series momentum (Moskowitz et al.) — strongest single momentum signal academically',
    evaluate: (data: MarketData, date: string): boolean => {
      const ret = getReturnMonths(data, 'GLD', date, 12);
      if (ret === null) return false;
      return ret > 0;
    },
  },
  {
    id: 'F11',
    category: 'F',
    name: '12-month momentum QQQ positive',
    condition: 'QQQ 12-month return > 0%',
    asset: 'QQQ',
    thesis: 'Time-series momentum',
    evaluate: (data: MarketData, date: string): boolean => {
      const ret = getReturnMonths(data, 'QQQ', date, 12);
      if (ret === null) return false;
      return ret > 0;
    },
  },
  {
    id: 'F12',
    category: 'F',
    name: '12-month momentum SLV positive',
    condition: 'SLV 12-month return > 0%',
    asset: 'SLV',
    thesis: 'Silver momentum',
    evaluate: (data: MarketData, date: string): boolean => {
      const ret = getReturnMonths(data, 'SLV', date, 12);
      if (ret === null) return false;
      return ret > 0;
    },
  },
  {
    id: 'F13',
    category: 'F',
    name: 'All assets negative 12-month momentum',
    condition: 'GLD, SLV, QQQ all < 0% trailing 12mo',
    asset: 'Cash',
    thesis: 'Everything falling, cash is king',
    evaluate: (data: MarketData, date: string): boolean => {
      const gldRet = getReturnMonths(data, 'GLD', date, 12);
      const slvRet = getReturnMonths(data, 'SLV', date, 12);
      const qqqRet = getReturnMonths(data, 'QQQ', date, 12);
      if (gldRet === null || slvRet === null || qqqRet === null) return false;
      return gldRet < 0 && slvRet < 0 && qqqRet < 0;
    },
  },
  {
    id: 'F14',
    category: 'F',
    name: 'Dual momentum: GLD vs QQQ',
    condition: 'GLD 12mo return > QQQ 12mo return AND GLD > 0%',
    asset: 'GLD',
    thesis: 'Antonacci dual momentum: relative + absolute. Academic support across multiple asset classes.',
    evaluate: (data: MarketData, date: string): boolean => {
      const gldRet = getReturnMonths(data, 'GLD', date, 12);
      const qqqRet = getReturnMonths(data, 'QQQ', date, 12);
      if (gldRet === null || qqqRet === null) return false;
      return gldRet > qqqRet && gldRet > 0;
    },
  },
  {
    id: 'F15',
    category: 'F',
    name: 'Dual momentum: QQQ vs GLD',
    condition: 'QQQ 12mo return > GLD 12mo return AND QQQ > 0%',
    asset: 'QQQ',
    thesis: 'Best relative performer with positive absolute',
    evaluate: (data: MarketData, date: string): boolean => {
      const gldRet = getReturnMonths(data, 'GLD', date, 12);
      const qqqRet = getReturnMonths(data, 'QQQ', date, 12);
      if (gldRet === null || qqqRet === null) return false;
      return qqqRet > gldRet && qqqRet > 0;
    },
  },
  {
    id: 'F16',
    category: 'F',
    name: 'SLV relative strength vs GLD',
    condition: 'SLV 3mo return > GLD 3mo return by 5%+',
    asset: 'SLV',
    thesis: 'Silver outperformance = risk-on precious metals',
    evaluate: (data: MarketData, date: string): boolean => {
      const slvRet = getReturnMonths(data, 'SLV', date, 3);
      const gldRet = getReturnMonths(data, 'GLD', date, 3);
      if (slvRet === null || gldRet === null) return false;
      return (slvRet - gldRet) >= 0.05;
    },
  },
  {
    id: 'F17',
    category: 'F',
    name: 'GLD rate of change strong',
    condition: 'GLD 60-day ROC > 10%',
    asset: 'GLD',
    thesis: 'Strong momentum, ride it',
    evaluate: (data: MarketData, date: string): boolean => {
      const ret = getReturn(data, 'GLD', date, 60);
      if (ret === null) return false;
      return ret > 0.10;
    },
  },
  {
    id: 'F18',
    category: 'F',
    name: 'QQQ rate of change strong',
    condition: 'QQQ 60-day ROC > 10%',
    asset: 'QQQ',
    thesis: 'Strong equity momentum',
    evaluate: (data: MarketData, date: string): boolean => {
      const ret = getReturn(data, 'QQQ', date, 60);
      if (ret === null) return false;
      return ret > 0.10;
    },
  },
  {
    id: 'F19',
    category: 'F',
    name: 'Volatility-adjusted momentum GLD',
    condition: 'GLD return / GLD volatility > 1.0 (annualized)',
    asset: 'GLD',
    thesis: 'Risk-adjusted momentum per Moskowitz; Ilmanen (2011) shows vol-adjusted momentum produces higher Sharpe',
    evaluate: (data: MarketData, date: string): boolean => {
      // 12-month return annualized / 12-month realized vol
      const ret = getReturnMonths(data, 'GLD', date, 12);
      const vol = getRealizedVol(data, 'GLD', date, 252);
      if (ret === null || vol === null || vol === 0) return false;
      // ret is already ~ annual return (12 months), vol is annualized percentage
      // Convert vol to decimal for ratio
      const ratio = ret / (vol / 100);
      return ratio > 1.0;
    },
  },
  {
    id: 'F20',
    category: 'F',
    name: 'Volatility-adjusted momentum QQQ',
    condition: 'QQQ return / QQQ volatility > 1.0 (annualized)',
    asset: 'QQQ',
    thesis: 'Risk-adjusted momentum',
    evaluate: (data: MarketData, date: string): boolean => {
      const ret = getReturnMonths(data, 'QQQ', date, 12);
      const vol = getRealizedVol(data, 'QQQ', date, 252);
      if (ret === null || vol === null || vol === 0) return false;
      const ratio = ret / (vol / 100);
      return ratio > 1.0;
    },
  },
];

export default categoryF;
