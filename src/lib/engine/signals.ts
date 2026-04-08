// ===== CURRENT SIGNAL COMPUTATION =====
// Evaluates all rules for the most recent date and returns the current signal

import type { Asset, RuleDefinition, MarketData } from '@/lib/types';

export interface SignalResult {
  signal: Asset;
  activeRules: { id: string; active: boolean; value?: string }[];
}

/**
 * Compute the current signal by evaluating all rules against the most recent data point.
 *
 * @param rules - array of rule definitions to evaluate
 * @param ruleLogic - how rules combine: 'majority', 'all', or 'any'
 * @param data - market data containing prices and FRED series
 * @returns the current signal and per-rule activation status
 */
export function computeCurrentSignal(
  rules: RuleDefinition[],
  ruleLogic: string,
  data: MarketData
): SignalResult {
  // Find the most recent date across all price data
  const latestDate = findLatestDate(data);
  if (!latestDate) {
    return {
      signal: 'Cash',
      activeRules: rules.map((r) => ({ id: r.id, active: false })),
    };
  }

  // Evaluate each rule
  const activeRules: { id: string; active: boolean; value?: string }[] = [];
  const activeAssetVotes: Asset[] = [];

  for (const rule of rules) {
    let active = false;
    try {
      active = rule.evaluate(data, latestDate);
    } catch {
      active = false;
    }

    activeRules.push({
      id: rule.id,
      active,
      value: active ? rule.asset : undefined,
    });

    if (active) {
      activeAssetVotes.push(rule.asset);
    }
  }

  // Determine signal based on rule logic
  const logic = ruleLogic as 'majority' | 'all' | 'any';
  let signal: Asset = 'Cash';

  if (logic === 'all') {
    // All rules must fire for a non-Cash signal
    if (activeAssetVotes.length === rules.length && rules.length > 0) {
      signal = majorityVote(activeAssetVotes);
    }
  } else if (logic === 'any') {
    // Any rule firing triggers its asset
    if (activeAssetVotes.length > 0) {
      signal = majorityVote(activeAssetVotes);
    }
  } else {
    // 'majority': >50% must be active
    if (activeAssetVotes.length > rules.length / 2) {
      signal = majorityVote(activeAssetVotes);
    }
  }

  return { signal, activeRules };
}

/**
 * Find the most recent trading date in the market data.
 */
function findLatestDate(data: MarketData): string | null {
  let latest: string | null = null;

  for (const ticker of Object.keys(data.prices)) {
    const rows = data.prices[ticker];
    if (!rows || rows.length === 0) continue;

    // Prices should be sorted, but find the max to be safe
    for (const row of rows) {
      if (!latest || row.date > latest) {
        latest = row.date;
      }
    }
  }

  return latest;
}

/**
 * Majority vote among asset votes. Ties broken by priority: GLD > QQQ > SLV > Cash.
 */
function majorityVote(votes: Asset[]): Asset {
  if (votes.length === 0) return 'Cash';

  const counts: Record<Asset, number> = { GLD: 0, SLV: 0, QQQ: 0, Cash: 0 };
  for (const v of votes) {
    counts[v]++;
  }

  const priority: Asset[] = ['GLD', 'QQQ', 'SLV', 'Cash'];
  let best: Asset = 'Cash';
  let bestCount = 0;
  for (const asset of priority) {
    if (counts[asset] > bestCount) {
      bestCount = counts[asset];
      best = asset;
    }
  }
  return best;
}
