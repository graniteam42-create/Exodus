import type { RuleDefinition, MarketData } from '../../types';
import {
  monthOf,
  yearOf,
  isPresidentialCycleYear,
  isLastDaysOfQuarter,
  getReturnMonths,
  resolveTicker,
} from './helpers';

const categoryL: RuleDefinition[] = [
  {
    id: 'L1',
    category: 'L',
    name: 'Sell in May (equities)',
    condition: 'May-October period',
    asset: 'GLD',
    thesis: 'Historically weaker for stocks. Average returns ~10pp higher Nov-Apr vs May-Oct.',
    evaluate: (_data: MarketData, date: string): boolean => {
      const m = monthOf(date);
      return m >= 5 && m <= 10;
    },
  },
  {
    id: 'L2',
    category: 'L',
    name: 'November-April bullish',
    condition: 'November-April period',
    asset: 'QQQ',
    thesis: 'Historically strongest 6 months for equities',
    evaluate: (_data: MarketData, date: string): boolean => {
      const m = monthOf(date);
      return m >= 11 || m <= 4;
    },
  },
  {
    id: 'L3',
    category: 'L',
    name: 'January barometer',
    condition: 'S&P500 January return negative',
    asset: 'GLD',
    thesis: '"As goes January, so goes the year" - defensive if Jan negative',
    evaluate: (data: MarketData, date: string): boolean => {
      const m = monthOf(date);
      const year = yearOf(date);

      // Only applicable after January ends (Feb-Dec)
      if (m === 1) return false;

      // Get SPY return for January of this year
      const janStart = `${year}-01-02`;
      const janEnd = `${year}-01-31`;

      const prices = data.prices[resolveTicker(data, 'SPY')];
      if (!prices || prices.length === 0) return false;

      // Find first trading day of January
      let startIdx = -1;
      let endIdx = -1;
      for (let i = 0; i < prices.length; i++) {
        if (prices[i].date >= janStart && startIdx === -1) startIdx = i;
        if (prices[i].date <= janEnd) endIdx = i;
      }

      if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) return false;

      const janReturn = (prices[endIdx].adjusted_close - prices[startIdx].adjusted_close) /
        prices[startIdx].adjusted_close;
      return janReturn < 0;
    },
  },
  {
    id: 'L4',
    category: 'L',
    name: 'September danger zone',
    condition: 'September-October',
    asset: 'Cash',
    thesis: 'Historically worst months for equities, crash months',
    evaluate: (_data: MarketData, date: string): boolean => {
      const m = monthOf(date);
      return m === 9 || m === 10;
    },
  },
  {
    id: 'L5',
    category: 'L',
    name: 'Year 3 of presidential cycle',
    condition: '3rd year of US presidential cycle',
    asset: 'QQQ',
    thesis: 'Historically strongest year. S&P excess return ~10% higher in years 3-4 vs 1-2.',
    evaluate: (_data: MarketData, date: string): boolean => {
      return isPresidentialCycleYear(date, 3);
    },
  },
  {
    id: 'L6',
    category: 'L',
    name: 'Gold seasonal strong',
    condition: 'Aug-Feb',
    asset: 'GLD',
    thesis: 'Gold historically strongest (jewelry demand + Indian wedding season + Chinese New Year)',
    evaluate: (_data: MarketData, date: string): boolean => {
      const m = monthOf(date);
      return m >= 8 || m <= 2;
    },
  },
  {
    id: 'L7',
    category: 'L',
    name: 'Election year uncertainty',
    condition: 'June-October of election year',
    asset: 'GLD',
    thesis: 'Political uncertainty favors gold',
    evaluate: (_data: MarketData, date: string): boolean => {
      const m = monthOf(date);
      const isElectionYear = isPresidentialCycleYear(date, 4);
      return isElectionYear && m >= 6 && m <= 10;
    },
  },
  {
    id: 'L8',
    category: 'L',
    name: 'Quarter-end rebalancing',
    condition: 'Last 5 days of quarter',
    asset: 'Cash',
    thesis: 'Institutional rebalancing creates noise',
    evaluate: (_data: MarketData, date: string): boolean => {
      return isLastDaysOfQuarter(date, 5);
    },
  },
];

export default categoryL;
