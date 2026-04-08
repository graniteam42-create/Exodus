import type { RuleDefinition, MarketData } from '../../types';
import {
  getFredValue,
  getFredValueNMonthsAgo,
  getFredYoY,
  isFredFallingForMonths,
  getRecentFredRows,
} from './helpers';

/**
 * Category I uses several leading indicators that may not all be in the core FRED set.
 * Series IDs used:
 *   - UMCSENT (Michigan Consumer Sentiment) - available
 *   - RECPROUSM156N (Recession Probabilities) - available
 *   - For LEI, ISM, Housing Starts, Retail Sales, Industrial Production:
 *     USSLIND (LEI proxy), MANEMP or NAPMNI (ISM proxy), HOUST (housing starts),
 *     RSAFS (retail sales), INDPRO (industrial production)
 *   These are best-effort FRED series. Rules return false if data unavailable.
 */

const categoryI: RuleDefinition[] = [
  {
    id: 'I1',
    category: 'I',
    name: 'LEI declining',
    condition: 'Conference Board LEI down 6+ consecutive months',
    asset: 'GLD',
    thesis: 'Leading indicator of recession. LEI anticipates turning points by ~7 months.',
    evaluate: (data: MarketData, date: string): boolean => {
      // Try USSLIND (Leading Index for the US) as LEI proxy
      return isFredFallingForMonths(data, 'USSLIND', date, 6);
    },
  },
  {
    id: 'I2',
    category: 'I',
    name: 'LEI deeply negative',
    condition: 'LEI YoY change < -5%',
    asset: 'Cash',
    thesis: 'Severe contraction ahead',
    evaluate: (data: MarketData, date: string): boolean => {
      const yoy = getFredYoY(data, 'USSLIND', date);
      if (yoy === null) return false;
      return yoy < -0.05;
    },
  },
  {
    id: 'I3',
    category: 'I',
    name: 'LEI turning up',
    condition: 'LEI rising after 6+ months of decline',
    asset: 'QQQ',
    thesis: 'Early recovery signal',
    evaluate: (data: MarketData, date: string): boolean => {
      // Current month is rising
      const rows = getRecentFredRows(data, 'USSLIND', date, 8);
      if (!rows || rows.length < 8) return false;

      // Last value > second-to-last (now rising)
      if (rows[rows.length - 1].value <= rows[rows.length - 2].value) return false;

      // Prior 6 months were declining
      for (let i = 1; i < rows.length - 1; i++) {
        if (rows[i].value >= rows[i - 1].value) return false;
      }
      return true;
    },
  },
  // I4-I7 removed: NAPM/NAPMNOI/NAPMII (ISM data) not available on FRED (proprietary)
  {
    id: 'I8',
    category: 'I',
    name: 'Consumer confidence plunging',
    condition: 'Conference Board index down 20%+ in 6 months',
    asset: 'GLD',
    thesis: 'Consumer pullback -> recession risk',
    evaluate: (data: MarketData, date: string): boolean => {
      // Use UMCSENT (Michigan) as proxy
      const current = getFredValue(data, 'UMCSENT', date);
      const past = getFredValueNMonthsAgo(data, 'UMCSENT', date, 6);
      if (current === null || past === null || past === 0) return false;
      return (past - current) / past >= 0.20;
    },
  },
  {
    id: 'I9',
    category: 'I',
    name: 'Consumer confidence recovering',
    condition: 'Conference Board index up 15%+ from trough',
    asset: 'QQQ',
    thesis: 'Consumer revival',
    evaluate: (data: MarketData, date: string): boolean => {
      const current = getFredValue(data, 'UMCSENT', date);
      // Find trough in last 12 months
      const rows = getRecentFredRows(data, 'UMCSENT', date, 12);
      if (current === null || !rows || rows.length < 3) return false;
      const trough = Math.min(...rows.map(r => r.value));
      if (trough === 0) return false;
      return (current - trough) / trough >= 0.15;
    },
  },
  {
    id: 'I10',
    category: 'I',
    name: 'Housing starts declining',
    condition: 'Housing starts down 20%+ YoY',
    asset: 'GLD',
    thesis: 'Housing leads the economy by 12-18 months',
    evaluate: (data: MarketData, date: string): boolean => {
      const yoy = getFredYoY(data, 'HOUST', date);
      if (yoy === null) return false;
      return yoy < -0.20;
    },
  },
  {
    id: 'I11',
    category: 'I',
    name: 'Retail sales declining',
    condition: 'Real retail sales negative YoY',
    asset: 'Cash',
    thesis: 'Consumer recession',
    evaluate: (data: MarketData, date: string): boolean => {
      // RSAFS = Advance Retail Sales
      const yoy = getFredYoY(data, 'RSAFS', date);
      if (yoy === null) return false;
      // Approximate "real" by checking if nominal YoY is below CPI YoY
      const cpiYoY = getFredYoY(data, 'CPIAUCSL', date);
      if (cpiYoY !== null) {
        return (yoy - cpiYoY) < 0; // real growth negative
      }
      // Fallback: just check nominal
      return yoy < 0;
    },
  },
  {
    id: 'I12',
    category: 'I',
    name: 'Industrial production declining',
    condition: 'IP negative YoY for 3+ months',
    asset: 'GLD',
    thesis: 'Broad economic weakening',
    evaluate: (data: MarketData, date: string): boolean => {
      // INDPRO = Industrial Production Index
      const rows = getRecentFredRows(data, 'INDPRO', date, 15);
      if (!rows || rows.length < 15) return false;

      // Check last 3 months all have negative YoY
      for (let i = rows.length - 3; i < rows.length; i++) {
        const pastIdx = i - 12;
        if (pastIdx < 0) return false;
        const yoy = (rows[i].value - rows[pastIdx].value) / rows[pastIdx].value;
        if (yoy >= 0) return false;
      }
      return true;
    },
  },
];

export default categoryI;
