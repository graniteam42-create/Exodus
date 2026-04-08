import type { RuleDefinition, MarketData } from '../../types';
import {
  getFredValue,
  getFredValueNMonthsAgo,
  getFredYoY,
  getFredChangeOverMonths,
  getPrice,
  getPriceN,
  getSMA,
  getRSI,
  getReturnMonths,
  getRecentFredRows,
} from './helpers';

const categoryM: RuleDefinition[] = [
  {
    id: 'M1',
    category: 'M',
    name: 'Risk-off regime',
    condition: 'VIX > 22 AND yield curve inverted AND HY spreads > 400bp',
    asset: 'Cash',
    thesis: 'Multiple stress indicators aligned',
    evaluate: (data: MarketData, date: string): boolean => {
      const vix = getFredValue(data, 'VIXCLS', date);
      const spread = getFredValue(data, 'T10Y2Y', date);
      const hy = getFredValue(data, 'BAMLH0A0HYM2', date);
      if (vix === null || spread === null || hy === null) return false;
      return vix > 22 && spread < 0 && hy > 4.0;
    },
  },
  {
    id: 'M2',
    category: 'M',
    name: 'Risk-on regime',
    condition: 'VIX < 16 AND QQQ > SMA200 AND HY spreads < 350bp',
    asset: 'QQQ',
    thesis: 'Multiple green lights for risk',
    evaluate: (data: MarketData, date: string): boolean => {
      const vix = getFredValue(data, 'VIXCLS', date);
      const qqqPrice = getPrice(data, 'QQQ', date);
      const qqqSma = getSMA(data, 'QQQ', date, 200);
      const hy = getFredValue(data, 'BAMLH0A0HYM2', date);
      if (vix === null || qqqPrice === null || qqqSma === null || hy === null) return false;
      return vix < 16 && qqqPrice > qqqSma && hy < 3.5;
    },
  },
  {
    id: 'M3',
    category: 'M',
    name: 'Stagflation setup',
    condition: 'CPI > 3% AND unemployment rising AND Fed on hold',
    asset: 'GLD',
    thesis: "Gold's best environment historically",
    evaluate: (data: MarketData, date: string): boolean => {
      const cpiYoY = getFredYoY(data, 'CPIAUCSL', date);
      const unrate = getFredValue(data, 'UNRATE', date);
      const unratePast = getFredValueNMonthsAgo(data, 'UNRATE', date, 3);
      const ffChange = getFredChangeOverMonths(data, 'FEDFUNDS', date, 3);
      if (cpiYoY === null || unrate === null || unratePast === null || ffChange === null) return false;
      return cpiYoY > 0.03 && unrate > unratePast && Math.abs(ffChange) < 0.1;
    },
  },
  {
    id: 'M4',
    category: 'M',
    name: 'Deflationary bust',
    condition: 'CPI falling AND unemployment surging AND VIX > 30',
    asset: 'Cash',
    thesis: 'Everything falls, cash only',
    evaluate: (data: MarketData, date: string): boolean => {
      const cpiYoY = getFredYoY(data, 'CPIAUCSL', date);
      const cpiYoYPast = (() => {
        const rows = getRecentFredRows(data, 'CPIAUCSL', date, 15);
        if (!rows || rows.length < 15) return null;
        return (rows[rows.length - 4].value - rows[rows.length - 16 + rows.length < 16 ? 0 : rows.length - 16].value);
      })();
      // Simpler: check if CPI YoY is declining
      const rows = getRecentFredRows(data, 'CPIAUCSL', date, 14);
      if (!rows || rows.length < 14) return false;
      const currentYoY = (rows[rows.length - 1].value - rows[rows.length - 13].value) / rows[rows.length - 13].value;
      const prevYoY = (rows[rows.length - 2].value - rows[rows.length - 14].value) / rows[rows.length - 14].value;
      const cpiFalling = currentYoY < prevYoY;

      const unrate = getFredValue(data, 'UNRATE', date);
      const unratePast = getFredValueNMonthsAgo(data, 'UNRATE', date, 6);
      const vix = getFredValue(data, 'VIXCLS', date);
      if (unrate === null || unratePast === null || vix === null) return false;
      const unemploymentSurging = (unrate - unratePast) >= 1.0;

      return cpiFalling && unemploymentSurging && vix > 30;
    },
  },
  {
    id: 'M5',
    category: 'M',
    name: 'Goldilocks',
    condition: 'CPI < 3% AND unemployment < 4.5% AND GDP > 2%',
    asset: 'QQQ',
    thesis: 'Perfect macro for equities',
    evaluate: (data: MarketData, date: string): boolean => {
      const cpiYoY = getFredYoY(data, 'CPIAUCSL', date);
      const unrate = getFredValue(data, 'UNRATE', date);
      if (cpiYoY === null || unrate === null) return false;
      if (cpiYoY >= 0.03 || unrate >= 4.5) return false;

      // GDP proxy: use recession probability as inverse indicator
      const recProb = getFredValue(data, 'RECPROUSM156N', date);
      if (recProb !== null) {
        return recProb < 20; // Low recession probability = growth likely > 2%
      }

      // Alternative: if no recession probability, just check CPI + unemployment conditions
      return true;
    },
  },
  {
    id: 'M6',
    category: 'M',
    name: 'Precious metals bull regime',
    condition: 'Real yields < 0% AND DXY falling AND GLD > SMA200',
    asset: 'GLD',
    thesis: 'Triple confirmation for gold',
    evaluate: (data: MarketData, date: string): boolean => {
      const realYield = getFredValue(data, 'DFII10', date);
      const gldPrice = getPrice(data, 'GLD', date);
      const gldSma = getSMA(data, 'GLD', date, 200);
      const uup = getPrice(data, 'UUP', date);
      const uupPast = getPriceN(data, 'UUP', date, 63); // 3-month lookback
      if (realYield === null || gldPrice === null || gldSma === null ||
          uup === null || uupPast === null) return false;
      return realYield < 0 && uup < uupPast && gldPrice > gldSma;
    },
  },
  {
    id: 'M7',
    category: 'M',
    name: 'Silver catch-up trade',
    condition: 'GLD/SLV ratio > 80 AND GLD > SMA200 AND SLV > SMA50',
    asset: 'SLV',
    thesis: 'Silver undervalued in gold bull market',
    evaluate: (data: MarketData, date: string): boolean => {
      const gldPrice = getPrice(data, 'GLD', date);
      const slvPrice = getPrice(data, 'SLV', date);
      const gldSma200 = getSMA(data, 'GLD', date, 200);
      const slvSma50 = getSMA(data, 'SLV', date, 50);
      if (gldPrice === null || slvPrice === null || slvPrice === 0 ||
          gldSma200 === null || slvSma50 === null) return false;
      const ratio = gldPrice / slvPrice;
      return ratio > 80 && gldPrice > gldSma200 && slvPrice > slvSma50;
    },
  },
  {
    id: 'M8',
    category: 'M',
    name: 'Bear market confirmed',
    condition: 'QQQ < SMA200 AND QQQ drawdown > 15% AND VIX > 25',
    asset: 'GLD',
    thesis: 'Rotate from equities to gold',
    evaluate: (data: MarketData, date: string): boolean => {
      const qqqPrice = getPrice(data, 'QQQ', date);
      const qqqSma = getSMA(data, 'QQQ', date, 200);
      const vix = getFredValue(data, 'VIXCLS', date);
      if (qqqPrice === null || qqqSma === null || vix === null) return false;
      if (qqqPrice >= qqqSma || vix <= 25) return false;

      // Check drawdown from 52-week high
      const idx = (() => {
        const prices = data.prices['QQQ'];
        if (!prices) return null;
        let i = prices.length - 1;
        while (i >= 0 && prices[i].date > date) i--;
        return i;
      })();
      if (idx === null || idx < 252) return false;
      const prices = data.prices['QQQ'];
      let peak = -Infinity;
      for (let i = idx - 252; i <= idx; i++) {
        if (prices[i].adjusted_close > peak) peak = prices[i].adjusted_close;
      }
      const drawdown = (peak - qqqPrice) / peak;
      return drawdown > 0.15;
    },
  },
  {
    id: 'M9',
    category: 'M',
    name: 'Recovery entry',
    condition: 'QQQ RSI < 35 AND VIX > 30 AND Fed cutting',
    asset: 'QQQ',
    thesis: 'Buy the panic when Fed is supporting',
    evaluate: (data: MarketData, date: string): boolean => {
      const rsi = getRSI(data, 'QQQ', date, 14);
      const vix = getFredValue(data, 'VIXCLS', date);
      const ffChange = getFredChangeOverMonths(data, 'FEDFUNDS', date, 3);
      if (rsi === null || vix === null || ffChange === null) return false;
      return rsi < 35 && vix > 30 && ffChange < -0.10;
    },
  },
  {
    id: 'M10',
    category: 'M',
    name: 'Late cycle excess',
    condition: 'VIX < 14 AND HY spread < 300bp AND margin debt at high',
    asset: 'Cash',
    thesis: 'Everything looks great = top is near',
    evaluate: (data: MarketData, date: string): boolean => {
      const vix = getFredValue(data, 'VIXCLS', date);
      const hy = getFredValue(data, 'BAMLH0A0HYM2', date);
      if (vix === null || hy === null) return false;
      if (vix >= 14 || hy >= 3.0) return false;

      // Margin debt at high: check if available, otherwise just use VIX + HY
      const marginDebt = getFredValue(data, 'BOGZ1FL663067003Q', date);
      if (marginDebt !== null) {
        const rows = data.fred['BOGZ1FL663067003Q'];
        if (rows) {
          let idx = rows.length - 1;
          while (idx >= 0 && rows[idx].date > date) idx--;
          if (idx >= 0) {
            let isNearHigh = true;
            for (let i = 0; i < idx; i++) {
              if (rows[i].value > marginDebt * 1.05) {
                isNearHigh = false;
                break;
              }
            }
            return isNearHigh;
          }
        }
      }
      // Without margin data, use VIX + HY conditions alone
      return true;
    },
  },
  {
    id: 'M11',
    category: 'M',
    name: 'Liquidity crisis',
    condition: 'VIX > 35 AND HY spreads rising fast AND DXY surging',
    asset: 'Cash',
    thesis: 'Dollar liquidity crisis, cash is king',
    evaluate: (data: MarketData, date: string): boolean => {
      const vix = getFredValue(data, 'VIXCLS', date);
      const hyChange = getFredChangeOverMonths(data, 'BAMLH0A0HYM2', date, 1);
      const uup = getPrice(data, 'UUP', date);
      const uupPast = getPriceN(data, 'UUP', date, 21);
      if (vix === null || hyChange === null || uup === null || uupPast === null || uupPast === 0) return false;
      const dxySurging = (uup - uupPast) / uupPast > 0.03;
      return vix > 35 && hyChange > 1.0 && dxySurging;
    },
  },
  {
    id: 'M12',
    category: 'M',
    name: 'Inflation trade',
    condition: 'CPI rising AND real yields negative AND DXY falling',
    asset: 'GLD',
    thesis: 'Classic inflation hedge environment',
    evaluate: (data: MarketData, date: string): boolean => {
      const cpiYoY = getFredYoY(data, 'CPIAUCSL', date);
      const cpiYoYPast = (() => {
        const rows = getRecentFredRows(data, 'CPIAUCSL', date, 14);
        if (!rows || rows.length < 14) return null;
        return (rows[rows.length - 2].value - rows[rows.length - 14].value) / rows[rows.length - 14].value;
      })();
      const realYield = getFredValue(data, 'DFII10', date);
      const uup = getPrice(data, 'UUP', date);
      const uupPast = getPriceN(data, 'UUP', date, 63);
      if (cpiYoY === null || cpiYoYPast === null || realYield === null ||
          uup === null || uupPast === null) return false;
      return cpiYoY > cpiYoYPast && realYield < 0 && uup < uupPast;
    },
  },
  {
    id: 'M13',
    category: 'M',
    name: 'Disinflation recovery',
    condition: 'CPI falling AND Fed cutting AND QQQ > SMA50',
    asset: 'QQQ',
    thesis: 'Best equity environment',
    evaluate: (data: MarketData, date: string): boolean => {
      const cpiYoY = getFredYoY(data, 'CPIAUCSL', date);
      const cpiYoYPast = (() => {
        const rows = getRecentFredRows(data, 'CPIAUCSL', date, 14);
        if (!rows || rows.length < 14) return null;
        return (rows[rows.length - 2].value - rows[rows.length - 14].value) / rows[rows.length - 14].value;
      })();
      const ffChange = getFredChangeOverMonths(data, 'FEDFUNDS', date, 6);
      const qqqPrice = getPrice(data, 'QQQ', date);
      const qqqSma50 = getSMA(data, 'QQQ', date, 50);
      if (cpiYoY === null || cpiYoYPast === null || ffChange === null ||
          qqqPrice === null || qqqSma50 === null) return false;
      return cpiYoY < cpiYoYPast && ffChange < -0.25 && qqqPrice > qqqSma50;
    },
  },
  {
    id: 'M14',
    category: 'M',
    name: 'Commodity supercycle',
    condition: 'GLD > SMA200 AND SLV > SMA200 AND DXY < SMA200',
    asset: 'SLV',
    thesis: 'Broad commodity strength, silver has highest beta',
    evaluate: (data: MarketData, date: string): boolean => {
      const gldPrice = getPrice(data, 'GLD', date);
      const gldSma = getSMA(data, 'GLD', date, 200);
      const slvPrice = getPrice(data, 'SLV', date);
      const slvSma = getSMA(data, 'SLV', date, 200);
      const uupPrice = getPrice(data, 'UUP', date);
      const uupSma = getSMA(data, 'UUP', date, 200);
      if (gldPrice === null || gldSma === null || slvPrice === null || slvSma === null ||
          uupPrice === null || uupSma === null) return false;
      return gldPrice > gldSma && slvPrice > slvSma && uupPrice < uupSma;
    },
  },
  {
    id: 'M15',
    category: 'M',
    name: 'Fear peak reversal',
    condition: 'VIX was > 40, now declining AND QQQ RSI < 35',
    asset: 'QQQ',
    thesis: 'Maximum fear is maximum opportunity',
    evaluate: (data: MarketData, date: string): boolean => {
      const rsi = getRSI(data, 'QQQ', date, 14);
      if (rsi === null || rsi >= 35) return false;

      const rows = data.fred['VIXCLS'];
      if (!rows || rows.length === 0) return false;
      let idx = rows.length - 1;
      while (idx >= 0 && rows[idx].date > date) idx--;
      if (idx < 20) return false;

      const current = rows[idx].value;
      // VIX is currently declining (below 5-day ago)
      if (idx < 5 || current >= rows[idx - 5].value) return false;

      // VIX was > 40 in last 20 days
      for (let i = idx - 20; i < idx; i++) {
        if (rows[i].value > 40) return true;
      }
      return false;
    },
  },
  {
    id: 'M16',
    category: 'M',
    name: 'Dollar crisis',
    condition: 'DXY down > 10% in 6 months AND M2 growing > 10%',
    asset: 'GLD',
    thesis: "Monetary debasement, gold's strongest thesis",
    evaluate: (data: MarketData, date: string): boolean => {
      const uup = getPrice(data, 'UUP', date);
      const uupPast = getPriceN(data, 'UUP', date, 126);
      const m2YoY = getFredYoY(data, 'M2SL', date);
      if (uup === null || uupPast === null || uupPast === 0 || m2YoY === null) return false;
      const dxyDecline = (uupPast - uup) / uupPast;
      return dxyDecline > 0.10 && m2YoY > 0.10;
    },
  },
];

export default categoryM;
