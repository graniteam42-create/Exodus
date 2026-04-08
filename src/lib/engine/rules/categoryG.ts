import type { RuleDefinition, MarketData } from '../../types';
import {
  getPrice,
  getSMA,
  getRSI,
  getBollingerBands,
  getDrawdownFromHigh,
} from './helpers';

const categoryG: RuleDefinition[] = [
  {
    id: 'G1',
    category: 'G',
    name: 'GLD RSI oversold',
    condition: 'GLD RSI(14) < 30',
    asset: 'GLD',
    thesis: 'Mean reversion after panic selling (58% win rate, +6.8% avg winner on daily backtest 2014-2024)',
    evaluate: (data: MarketData, date: string): boolean => {
      const rsi = getRSI(data, 'GLD', date, 14);
      if (rsi === null) return false;
      return rsi < 30;
    },
  },
  {
    id: 'G2',
    category: 'G',
    name: 'QQQ RSI oversold',
    condition: 'QQQ RSI(14) < 30',
    asset: 'QQQ',
    thesis: 'Oversold bounce',
    evaluate: (data: MarketData, date: string): boolean => {
      const rsi = getRSI(data, 'QQQ', date, 14);
      if (rsi === null) return false;
      return rsi < 30;
    },
  },
  {
    id: 'G3',
    category: 'G',
    name: 'SLV RSI oversold',
    condition: 'SLV RSI(14) < 30',
    asset: 'SLV',
    thesis: 'Oversold bounce',
    evaluate: (data: MarketData, date: string): boolean => {
      const rsi = getRSI(data, 'SLV', date, 14);
      if (rsi === null) return false;
      return rsi < 30;
    },
  },
  {
    id: 'G4',
    category: 'G',
    name: 'GLD RSI overbought',
    condition: 'GLD RSI(14) > 75',
    asset: 'Cash',
    thesis: 'Take profits, overbought',
    evaluate: (data: MarketData, date: string): boolean => {
      const rsi = getRSI(data, 'GLD', date, 14);
      if (rsi === null) return false;
      return rsi > 75;
    },
  },
  {
    id: 'G5',
    category: 'G',
    name: 'QQQ RSI overbought',
    condition: 'QQQ RSI(14) > 80',
    asset: 'Cash',
    thesis: 'Take profits, extreme greed',
    evaluate: (data: MarketData, date: string): boolean => {
      const rsi = getRSI(data, 'QQQ', date, 14);
      if (rsi === null) return false;
      return rsi > 80;
    },
  },
  {
    id: 'G6',
    category: 'G',
    name: 'GLD at lower Bollinger Band',
    condition: 'GLD at or below 2-std lower band (20-day)',
    asset: 'GLD',
    thesis: 'Statistical mean reversion. Combined with RSI < 30: 64% win rate.',
    evaluate: (data: MarketData, date: string): boolean => {
      const price = getPrice(data, 'GLD', date);
      const bands = getBollingerBands(data, 'GLD', date, 20, 2);
      if (price === null || bands === null) return false;
      return price <= bands.lower;
    },
  },
  {
    id: 'G7',
    category: 'G',
    name: 'QQQ at lower Bollinger Band',
    condition: 'QQQ at or below 2-std lower band',
    asset: 'QQQ',
    thesis: 'Statistical mean reversion',
    evaluate: (data: MarketData, date: string): boolean => {
      const price = getPrice(data, 'QQQ', date);
      const bands = getBollingerBands(data, 'QQQ', date, 20, 2);
      if (price === null || bands === null) return false;
      return price <= bands.lower;
    },
  },
  {
    id: 'G8',
    category: 'G',
    name: 'GLD drawdown from 52-week high > 15%',
    condition: '(high - current) / high > 15%',
    asset: 'GLD',
    thesis: 'Deep drawdown = potential opportunity',
    evaluate: (data: MarketData, date: string): boolean => {
      const dd = getDrawdownFromHigh(data, 'GLD', date, 252);
      if (dd === null) return false;
      return dd > 0.15;
    },
  },
  {
    id: 'G9',
    category: 'G',
    name: 'QQQ drawdown from 52-week high > 20%',
    condition: 'Drawdown > 20%',
    asset: 'QQQ',
    thesis: 'Correction territory, historically good entry',
    evaluate: (data: MarketData, date: string): boolean => {
      const dd = getDrawdownFromHigh(data, 'QQQ', date, 252);
      if (dd === null) return false;
      return dd > 0.20;
    },
  },
  {
    id: 'G10',
    category: 'G',
    name: 'QQQ drawdown from 52-week high > 30%',
    condition: 'Drawdown > 30%',
    asset: 'QQQ',
    thesis: 'Bear market, historically excellent entry for long-term',
    evaluate: (data: MarketData, date: string): boolean => {
      const dd = getDrawdownFromHigh(data, 'QQQ', date, 252);
      if (dd === null) return false;
      return dd > 0.30;
    },
  },
  {
    id: 'G11',
    category: 'G',
    name: 'Price far above SMA200 QQQ',
    condition: 'QQQ > 120% of SMA200',
    asset: 'Cash',
    thesis: 'Overextended, reversion risk',
    evaluate: (data: MarketData, date: string): boolean => {
      const price = getPrice(data, 'QQQ', date);
      const sma = getSMA(data, 'QQQ', date, 200);
      if (price === null || sma === null || sma === 0) return false;
      return price > sma * 1.20;
    },
  },
  {
    id: 'G12',
    category: 'G',
    name: 'Price far above SMA200 GLD',
    condition: 'GLD > 115% of SMA200',
    asset: 'Cash',
    thesis: 'Gold overextended',
    evaluate: (data: MarketData, date: string): boolean => {
      const price = getPrice(data, 'GLD', date);
      const sma = getSMA(data, 'GLD', date, 200);
      if (price === null || sma === null || sma === 0) return false;
      return price > sma * 1.15;
    },
  },
];

export default categoryG;
