import type { RuleDefinition, MarketData } from '../../types';
import {
  getPrice,
  getPriceN,
  getSMA,
  getReturn,
  getReturnMonths,
  getDateIndex,
} from './helpers';

/** Compute the Gold/Silver price ratio */
function goldSilverRatio(data: MarketData, date: string): number | null {
  const gld = getPrice(data, 'GLD', date);
  const slv = getPrice(data, 'SLV', date);
  if (gld === null || slv === null || slv === 0) return null;
  return gld / slv;
}

/** Compute the Copper/Gold price ratio using COPX as copper proxy */
function copperGoldRatio(data: MarketData, date: string): number | null {
  const copx = getPrice(data, 'COPX', date);
  const gld = getPrice(data, 'GLD', date);
  if (copx === null || gld === null || gld === 0) return null;
  return copx / gld;
}

const categoryH: RuleDefinition[] = [
  {
    id: 'H1',
    category: 'H',
    name: 'Gold/Silver ratio high',
    condition: 'GLD/SLV ratio > 80',
    asset: 'SLV',
    thesis: 'Silver undervalued vs gold, mean reversion. The 80/60 rule: silver rallied 40%, 300%, and 400% the last three times ratio exceeded 80.',
    evaluate: (data: MarketData, date: string): boolean => {
      const ratio = goldSilverRatio(data, date);
      if (ratio === null) return false;
      return ratio > 80;
    },
  },
  {
    id: 'H2',
    category: 'H',
    name: 'Gold/Silver ratio extreme',
    condition: 'GLD/SLV ratio > 90',
    asset: 'SLV',
    thesis: 'Crisis pricing (reached 123 during COVID). Silver catches up aggressively in recovery.',
    evaluate: (data: MarketData, date: string): boolean => {
      const ratio = goldSilverRatio(data, date);
      if (ratio === null) return false;
      return ratio > 90;
    },
  },
  {
    id: 'H3',
    category: 'H',
    name: 'Gold/Silver ratio low',
    condition: 'GLD/SLV ratio < 65',
    asset: 'GLD',
    thesis: 'Silver overheated, rotate to gold for safety',
    evaluate: (data: MarketData, date: string): boolean => {
      const ratio = goldSilverRatio(data, date);
      if (ratio === null) return false;
      return ratio < 65;
    },
  },
  {
    id: 'H4',
    category: 'H',
    name: 'Gold/Silver ratio falling fast',
    condition: 'GLD/SLV ratio down 10+ in 3 months',
    asset: 'SLV',
    thesis: 'Silver outperformance trend accelerating',
    evaluate: (data: MarketData, date: string): boolean => {
      const current = goldSilverRatio(data, date);
      // Ratio 3 months (~63 trading days) ago
      const gldPast = getPriceN(data, 'GLD', date, 63);
      const slvPast = getPriceN(data, 'SLV', date, 63);
      if (current === null || gldPast === null || slvPast === null || slvPast === 0) return false;
      const pastRatio = gldPast / slvPast;
      return (pastRatio - current) >= 10;
    },
  },
  {
    id: 'H5',
    category: 'H',
    name: 'Copper/Gold ratio falling',
    condition: 'Copper/Gold ratio declining for 3+ months',
    asset: 'GLD',
    thesis: 'Economic slowdown signal (Dr. Copper). Copper/Gold below 0.20 has 94% historical accuracy for recession.',
    evaluate: (data: MarketData, date: string): boolean => {
      // Check ratio at current, 1mo, 2mo, 3mo ago — each lower
      const ratios: number[] = [];
      for (let m = 0; m <= 3; m++) {
        const days = m * 21;
        const copx = days === 0 ? getPrice(data, 'COPX', date) : getPriceN(data, 'COPX', date, days);
        const gld = days === 0 ? getPrice(data, 'GLD', date) : getPriceN(data, 'GLD', date, days);
        if (copx === null || gld === null || gld === 0) return false;
        ratios.push(copx / gld);
      }
      // ratios[0] = current, ratios[3] = 3 months ago
      // Declining: each more recent is lower than previous
      for (let i = 0; i < 3; i++) {
        if (ratios[i] >= ratios[i + 1]) return false;
      }
      return true;
    },
  },
  {
    id: 'H6',
    category: 'H',
    name: 'Copper/Gold ratio rising',
    condition: 'Copper/Gold ratio rising for 3+ months',
    asset: 'QQQ',
    thesis: 'Economic expansion, risk on',
    evaluate: (data: MarketData, date: string): boolean => {
      const ratios: number[] = [];
      for (let m = 0; m <= 3; m++) {
        const days = m * 21;
        const copx = days === 0 ? getPrice(data, 'COPX', date) : getPriceN(data, 'COPX', date, days);
        const gld = days === 0 ? getPrice(data, 'GLD', date) : getPriceN(data, 'GLD', date, days);
        if (copx === null || gld === null || gld === 0) return false;
        ratios.push(copx / gld);
      }
      // Rising: each more recent is higher
      for (let i = 0; i < 3; i++) {
        if (ratios[i] <= ratios[i + 1]) return false;
      }
      return true;
    },
  },
  {
    id: 'H7',
    category: 'H',
    name: 'DXY strong',
    condition: 'DXY proxy (UUP) > 105',
    asset: 'Cash',
    thesis: 'Strong dollar headwind for gold AND commodities',
    evaluate: (data: MarketData, date: string): boolean => {
      // UUP is a dollar ETF, not 1:1 with DXY. UUP ~25-28 range.
      // DXY 105 ~ UUP roughly proportional. Use UUP relative to its SMA as strength proxy.
      // Alternative: if we have UUP price data, check if UUP is in upper range.
      // UUP launched around 27 representing DXY~80. At DXY 105, UUP ~29.
      const price = getPrice(data, 'UUP', date);
      if (price === null) return false;
      // UUP > 29 approximately corresponds to DXY > 105
      return price > 29;
    },
  },
  {
    id: 'H8',
    category: 'H',
    name: 'DXY weakening',
    condition: 'DXY down 5%+ from 6-month high',
    asset: 'GLD',
    thesis: 'Weak dollar -> gold benefits. 1% dollar decline -> ~3.09% gold increase.',
    evaluate: (data: MarketData, date: string): boolean => {
      const current = getPrice(data, 'UUP', date);
      // Find 6-month high
      const idx = getDateIndex(data, 'UUP', date);
      if (current === null || idx === null || idx < 126) return false;
      const prices = data.prices['UUP'];
      let high = -Infinity;
      for (let i = idx - 126; i <= idx; i++) {
        if (prices[i].adjusted_close > high) high = prices[i].adjusted_close;
      }
      if (high <= 0) return false;
      return (high - current) / high >= 0.05;
    },
  },
  {
    id: 'H9',
    category: 'H',
    name: 'DXY strong + QQQ strong',
    condition: 'DXY > 100 AND QQQ > SMA200',
    asset: 'QQQ',
    thesis: 'Dollar strength from growth, not crisis',
    evaluate: (data: MarketData, date: string): boolean => {
      const uup = getPrice(data, 'UUP', date);
      const qqqPrice = getPrice(data, 'QQQ', date);
      const qqqSma = getSMA(data, 'QQQ', date, 200);
      if (uup === null || qqqPrice === null || qqqSma === null) return false;
      // UUP > ~28 ~ DXY > 100
      return uup > 28 && qqqPrice > qqqSma;
    },
  },
  {
    id: 'H10',
    category: 'H',
    name: 'DXY breaking down',
    condition: 'DXY < SMA200 AND falling',
    asset: 'GLD',
    thesis: 'Dollar downtrend = gold uptrend',
    evaluate: (data: MarketData, date: string): boolean => {
      const price = getPrice(data, 'UUP', date);
      const sma200 = getSMA(data, 'UUP', date, 200);
      const pricePast = getPriceN(data, 'UUP', date, 21);
      if (price === null || sma200 === null || pricePast === null) return false;
      return price < sma200 && price < pricePast;
    },
  },
  {
    id: 'H11',
    category: 'H',
    name: 'Gold outperforming QQQ 6-month',
    condition: 'GLD 6mo return > QQQ 6mo return by 10%+',
    asset: 'GLD',
    thesis: 'Risk-off regime confirmed',
    evaluate: (data: MarketData, date: string): boolean => {
      const gldRet = getReturnMonths(data, 'GLD', date, 6);
      const qqqRet = getReturnMonths(data, 'QQQ', date, 6);
      if (gldRet === null || qqqRet === null) return false;
      return (gldRet - qqqRet) >= 0.10;
    },
  },
  {
    id: 'H12',
    category: 'H',
    name: 'QQQ outperforming Gold 6-month',
    condition: 'QQQ 6mo return > GLD 6mo return by 10%+',
    asset: 'QQQ',
    thesis: 'Risk-on regime confirmed',
    evaluate: (data: MarketData, date: string): boolean => {
      const gldRet = getReturnMonths(data, 'GLD', date, 6);
      const qqqRet = getReturnMonths(data, 'QQQ', date, 6);
      if (gldRet === null || qqqRet === null) return false;
      return (qqqRet - gldRet) >= 0.10;
    },
  },
  {
    id: 'H13',
    category: 'H',
    name: 'Gold and Silver both trending up',
    condition: 'GLD > SMA50 AND SLV > SMA50',
    asset: 'SLV',
    thesis: 'Precious metals bull = pick the higher-beta one',
    evaluate: (data: MarketData, date: string): boolean => {
      const gldP = getPrice(data, 'GLD', date);
      const gldSma = getSMA(data, 'GLD', date, 50);
      const slvP = getPrice(data, 'SLV', date);
      const slvSma = getSMA(data, 'SLV', date, 50);
      if (gldP === null || gldSma === null || slvP === null || slvSma === null) return false;
      return gldP > gldSma && slvP > slvSma;
    },
  },
  {
    id: 'H14',
    category: 'H',
    name: 'Gold up, Silver down',
    condition: 'GLD > SMA50 AND SLV < SMA50',
    asset: 'GLD',
    thesis: 'Fear-driven gold rally, silver not confirming = cautious',
    evaluate: (data: MarketData, date: string): boolean => {
      const gldP = getPrice(data, 'GLD', date);
      const gldSma = getSMA(data, 'GLD', date, 50);
      const slvP = getPrice(data, 'SLV', date);
      const slvSma = getSMA(data, 'SLV', date, 50);
      if (gldP === null || gldSma === null || slvP === null || slvSma === null) return false;
      return gldP > gldSma && slvP < slvSma;
    },
  },
  {
    id: 'H15',
    category: 'H',
    name: 'Everything down',
    condition: 'GLD < SMA50 AND SLV < SMA50 AND QQQ < SMA50',
    asset: 'Cash',
    thesis: 'Broad liquidation event',
    evaluate: (data: MarketData, date: string): boolean => {
      const gldP = getPrice(data, 'GLD', date);
      const gldSma = getSMA(data, 'GLD', date, 50);
      const slvP = getPrice(data, 'SLV', date);
      const slvSma = getSMA(data, 'SLV', date, 50);
      const qqqP = getPrice(data, 'QQQ', date);
      const qqqSma = getSMA(data, 'QQQ', date, 50);
      if (gldP === null || gldSma === null || slvP === null || slvSma === null ||
          qqqP === null || qqqSma === null) return false;
      return gldP < gldSma && slvP < slvSma && qqqP < qqqSma;
    },
  },
  {
    id: 'H16',
    category: 'H',
    name: 'Everything up',
    condition: 'GLD > SMA50 AND SLV > SMA50 AND QQQ > SMA50',
    asset: 'QQQ',
    thesis: 'Liquidity-driven rally, equities benefit most',
    evaluate: (data: MarketData, date: string): boolean => {
      const gldP = getPrice(data, 'GLD', date);
      const gldSma = getSMA(data, 'GLD', date, 50);
      const slvP = getPrice(data, 'SLV', date);
      const slvSma = getSMA(data, 'SLV', date, 50);
      const qqqP = getPrice(data, 'QQQ', date);
      const qqqSma = getSMA(data, 'QQQ', date, 50);
      if (gldP === null || gldSma === null || slvP === null || slvSma === null ||
          qqqP === null || qqqSma === null) return false;
      return gldP > gldSma && slvP > slvSma && qqqP > qqqSma;
    },
  },
  {
    id: 'H17',
    category: 'H',
    name: 'Gold relative strength vs all',
    condition: 'GLD best performer of 3 assets over 3 months',
    asset: 'GLD',
    thesis: 'Relative momentum, stay with winner',
    evaluate: (data: MarketData, date: string): boolean => {
      const gldRet = getReturnMonths(data, 'GLD', date, 3);
      const slvRet = getReturnMonths(data, 'SLV', date, 3);
      const qqqRet = getReturnMonths(data, 'QQQ', date, 3);
      if (gldRet === null || slvRet === null || qqqRet === null) return false;
      return gldRet > slvRet && gldRet > qqqRet;
    },
  },
  {
    id: 'H18',
    category: 'H',
    name: 'Silver relative strength vs all',
    condition: 'SLV best performer of 3 assets over 3 months',
    asset: 'SLV',
    thesis: 'Relative momentum',
    evaluate: (data: MarketData, date: string): boolean => {
      const gldRet = getReturnMonths(data, 'GLD', date, 3);
      const slvRet = getReturnMonths(data, 'SLV', date, 3);
      const qqqRet = getReturnMonths(data, 'QQQ', date, 3);
      if (gldRet === null || slvRet === null || qqqRet === null) return false;
      return slvRet > gldRet && slvRet > qqqRet;
    },
  },
];

export default categoryH;
