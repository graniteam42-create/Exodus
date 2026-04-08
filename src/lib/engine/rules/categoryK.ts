import type { RuleDefinition, MarketData } from '../../types';
import {
  getFredValue,
  getFredValueNMonthsAgo,
  getFredYoY,
  getFredMaxOverMonths,
  getRecentFredRows,
  resolveTicker,
} from './helpers';

/**
 * Category K: Sentiment & Positioning
 * Many of these data sources (AAII, put/call, margin debt) may not be available from FRED/EODHD.
 * Rules return false if data is unavailable, keeping them dormant until data is sourced.
 *
 * Potential FRED series:
 *   - AAII data: not in FRED, would need custom data source
 *   - Put/call: not in FRED
 *   - Margin debt: BOGZ1FL663067003Q (quarterly) or custom
 *   - Fund flows: not in FRED
 *
 * Where possible, we use UMCSENT as sentiment proxy.
 */

// K1-K5 removed: AAII sentiment + put/call ratio not available on FRED (proprietary data)

const categoryK: RuleDefinition[] = [
  {
    id: 'K6',
    category: 'K',
    name: 'Margin debt declining rapidly',
    condition: 'NYSE margin debt down 20%+ YoY',
    asset: 'Cash',
    thesis: 'Deleveraging underway',
    evaluate: (data: MarketData, date: string): boolean => {
      const yoy = getFredYoY(data, 'BOGZ1FL663067003Q', date);
      if (yoy === null) return false;
      return yoy < -0.20;
    },
  },
  {
    id: 'K7',
    category: 'K',
    name: 'Margin debt at record high',
    condition: 'Margin debt at all-time high + rising',
    asset: 'Cash',
    thesis: 'Excessive leverage = fragile market',
    evaluate: (data: MarketData, date: string): boolean => {
      const rows = data.fred['BOGZ1FL663067003Q'];
      if (!rows || rows.length < 4) return false;

      // Find index at or before date
      let idx = rows.length - 1;
      while (idx >= 0 && rows[idx].date > date) idx--;
      if (idx < 1 || idx < 0) return false;

      const current = rows[idx].value;
      const previous = rows[idx - 1].value;

      // Check if current is all-time high
      let isATH = true;
      for (let i = 0; i < idx; i++) {
        if (rows[i].value >= current) {
          isATH = false;
          break;
        }
      }
      return isATH && current > previous;
    },
  },
  {
    id: 'K8',
    category: 'K',
    name: 'Fund flows out of equities',
    condition: 'Large equity fund outflows 3+ months',
    asset: 'QQQ',
    thesis: 'Contrarian: retail leaving = opportunity',
    evaluate: (data: MarketData, date: string): boolean => {
      // Proxy using consumer sentiment as contrarian indicator
      // If UMCSENT is very low and falling, retail is likely pulling money out
      const current = getFredValue(data, 'UMCSENT', date);
      const past3m = getFredValueNMonthsAgo(data, 'UMCSENT', date, 3);
      if (current === null || past3m === null) return false;
      // Very low sentiment + still falling
      return current < 60 && current < past3m;
    },
  },
  {
    id: 'K9',
    category: 'K',
    name: 'Fund flows into gold',
    condition: 'Gold ETF inflows accelerating',
    asset: 'GLD',
    thesis: 'Smart money positioning for risk-off',
    evaluate: (data: MarketData, date: string): boolean => {
      // Proxy: GLD volume increasing + price rising
      // Check if GLD price is rising and volume is above average
      const prices = data.prices[resolveTicker(data, 'GLD')];
      if (!prices || prices.length === 0) return false;

      let idx = prices.length - 1;
      while (idx >= 0 && prices[idx].date > date) idx--;
      if (idx < 20) return false;

      const currentPrice = prices[idx].adjusted_close;
      const pastPrice = prices[idx - 20].adjusted_close;
      if (pastPrice === 0) return false;
      const priceRising = currentPrice > pastPrice;

      // Average volume last 20 days vs previous 20 days
      let vol20 = 0;
      let volPrev20 = 0;
      for (let i = idx - 19; i <= idx; i++) vol20 += prices[i].volume;
      for (let i = idx - 39; i <= idx - 20; i++) {
        if (i < 0) return false;
        volPrev20 += prices[i].volume;
      }
      const volumeIncreasing = vol20 > volPrev20 * 1.2; // 20% more volume

      return priceRising && volumeIncreasing;
    },
  },
  {
    id: 'K10',
    category: 'K',
    name: 'Sentiment + macro divergence',
    condition: 'Consumer sentiment high AND yield curve inverted',
    asset: 'Cash',
    thesis: 'Sentiment ignoring macro risk',
    evaluate: (data: MarketData, date: string): boolean => {
      const sentiment = getFredValue(data, 'UMCSENT', date);
      const spread = getFredValue(data, 'T10Y2Y', date);
      if (sentiment === null || spread === null) return false;
      return sentiment > 90 && spread < 0;
    },
  },
];

export default categoryK;
