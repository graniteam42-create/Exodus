// ===== CONSENSUS COMPUTATION =====
// Aggregates signals from multiple saved strategies into a weighted consensus

import type { Asset, ConsensusResult } from '@/lib/types';

interface StrategyVote {
  name: string;
  signal: Asset;
  rating: number; // 0-100 rating score used as weight
}

/**
 * Compute the consensus signal from multiple saved strategies.
 *
 * Each strategy's vote is weighted by its rating score.
 * The consensus allocation shows what percentage of total weight
 * points to each asset.
 *
 * @param savedStrategies - array of saved strategies with their current signals and ratings
 * @returns ConsensusResult with weighted allocations and agreement metrics
 */
export function computeConsensus(
  savedStrategies: StrategyVote[]
): ConsensusResult {
  // Edge case: no strategies
  if (savedStrategies.length === 0) {
    return {
      current_position: 'Cash',
      current_strategy_name: 'None',
      current_strategy_rating: 0,
      current_strategy_robustness: 0,
      weighted_allocation: { GLD: 0, SLV: 0, QQQ: 0, Cash: 100 },
      allocation_breakdown: [
        { asset: 'Cash', pct: 100, strategies: [] },
      ],
      agreement_pct: 100,
    };
  }

  // Total weight (sum of all ratings)
  const totalWeight = savedStrategies.reduce((sum, s) => sum + s.rating, 0);

  if (totalWeight === 0) {
    // All ratings are 0, equal weight
    return computeEqualWeight(savedStrategies);
  }

  // Compute weighted allocation per asset
  const assetWeight: Record<Asset, number> = { GLD: 0, SLV: 0, QQQ: 0, Cash: 0 };
  const assetStrategies: Record<Asset, { name: string; rating: number }[]> = {
    GLD: [], SLV: [], QQQ: [], Cash: [],
  };

  for (const strat of savedStrategies) {
    assetWeight[strat.signal] += strat.rating;
    assetStrategies[strat.signal].push({ name: strat.name, rating: strat.rating });
  }

  // Convert to percentages
  const weighted_allocation: Record<Asset, number> = {
    GLD: Math.round((assetWeight.GLD / totalWeight) * 100),
    SLV: Math.round((assetWeight.SLV / totalWeight) * 100),
    QQQ: Math.round((assetWeight.QQQ / totalWeight) * 100),
    Cash: Math.round((assetWeight.Cash / totalWeight) * 100),
  };

  // Fix rounding to sum to 100
  const sum = weighted_allocation.GLD + weighted_allocation.SLV + weighted_allocation.QQQ + weighted_allocation.Cash;
  if (sum !== 100) {
    // Add/subtract difference to the largest allocation
    const largest = (Object.entries(weighted_allocation) as [Asset, number][])
      .sort((a, b) => b[1] - a[1])[0][0];
    weighted_allocation[largest] += 100 - sum;
  }

  // Find the consensus asset (highest weighted allocation)
  const consensusAsset = (Object.entries(weighted_allocation) as [Asset, number][])
    .sort((a, b) => b[1] - a[1])[0][0];

  // Find the top-rated strategy (determines "current position")
  const topStrategy = [...savedStrategies].sort((a, b) => b.rating - a.rating)[0];

  // Agreement percentage: what fraction of total weight agrees with the consensus asset
  const agreementWeight = assetWeight[consensusAsset];
  const agreement_pct = Math.round((agreementWeight / totalWeight) * 100);

  // Build allocation breakdown (sorted by pct descending)
  const allAssets: Asset[] = ['GLD', 'SLV', 'QQQ', 'Cash'];
  const allocation_breakdown = allAssets
    .map((asset) => ({
      asset,
      pct: weighted_allocation[asset],
      strategies: assetStrategies[asset].sort((a, b) => b.rating - a.rating),
    }))
    .filter((entry) => entry.pct > 0 || entry.strategies.length > 0)
    .sort((a, b) => b.pct - a.pct);

  return {
    current_position: topStrategy.signal,
    current_strategy_name: topStrategy.name,
    current_strategy_rating: topStrategy.rating,
    current_strategy_robustness: 0, // Caller should fill this in if available
    weighted_allocation,
    allocation_breakdown,
    agreement_pct,
  };
}

/**
 * Equal-weight fallback when all ratings are 0.
 */
function computeEqualWeight(
  strategies: StrategyVote[]
): ConsensusResult {
  const count = strategies.length;
  const assetCounts: Record<Asset, number> = { GLD: 0, SLV: 0, QQQ: 0, Cash: 0 };
  const assetStrategies: Record<Asset, { name: string; rating: number }[]> = {
    GLD: [], SLV: [], QQQ: [], Cash: [],
  };

  for (const s of strategies) {
    assetCounts[s.signal]++;
    assetStrategies[s.signal].push({ name: s.name, rating: s.rating });
  }

  const weighted_allocation: Record<Asset, number> = {
    GLD: Math.round((assetCounts.GLD / count) * 100),
    SLV: Math.round((assetCounts.SLV / count) * 100),
    QQQ: Math.round((assetCounts.QQQ / count) * 100),
    Cash: Math.round((assetCounts.Cash / count) * 100),
  };

  const sum = weighted_allocation.GLD + weighted_allocation.SLV + weighted_allocation.QQQ + weighted_allocation.Cash;
  if (sum !== 100) {
    const largest = (Object.entries(weighted_allocation) as [Asset, number][])
      .sort((a, b) => b[1] - a[1])[0][0];
    weighted_allocation[largest] += 100 - sum;
  }

  const consensusAsset = (Object.entries(weighted_allocation) as [Asset, number][])
    .sort((a, b) => b[1] - a[1])[0][0];

  const allAssets: Asset[] = ['GLD', 'SLV', 'QQQ', 'Cash'];
  const allocation_breakdown = allAssets
    .map((asset) => ({
      asset,
      pct: weighted_allocation[asset],
      strategies: assetStrategies[asset],
    }))
    .filter((entry) => entry.pct > 0 || entry.strategies.length > 0)
    .sort((a, b) => b.pct - a.pct);

  return {
    current_position: consensusAsset,
    current_strategy_name: strategies[0]?.name ?? 'None',
    current_strategy_rating: 0,
    current_strategy_robustness: 0,
    weighted_allocation,
    allocation_breakdown,
    agreement_pct: Math.round((assetCounts[consensusAsset] / count) * 100),
  };
}
