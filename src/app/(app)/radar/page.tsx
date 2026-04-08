import { sql } from '@vercel/postgres';
import RadarClient from './client';
import { INDICATOR_CONFIGS, buildIndicatorSnapshots } from '@/lib/indicators';
import { computeRegimeScores, generateIndicatorAlerts } from '@/lib/regime';
import { scoreToGrade } from '@/lib/types';
import type { Asset, FredRow, ConsensusResult, DataSourceHealth } from '@/lib/types';

export const dynamic = 'force-dynamic';

async function getDataHealth(): Promise<{ date: string; sources: DataSourceHealth[] }> {
  try {
    const { rows } = await sql`
      SELECT source, series_id, last_updated::text, last_date::text, row_count
      FROM data_metadata
      ORDER BY source, series_id
    `;

    const grouped: Record<string, { count: number; latest: string }> = {};
    for (const row of rows) {
      const key = row.source as string;
      if (!grouped[key]) grouped[key] = { count: 0, latest: '' };
      grouped[key].count++;
      if (!grouped[key].latest || row.last_updated > grouped[key].latest) {
        grouped[key].latest = row.last_updated as string;
      }
    }

    const now = new Date();
    const sources: DataSourceHealth[] = Object.entries(grouped).map(([source, info]) => {
      const updated = new Date(info.latest);
      const diffDays = (now.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24);
      return {
        source,
        status: diffDays <= 2 ? 'ok' as const : diffDays <= 14 ? 'lagged' as const : 'stale' as const,
        last_updated: info.latest,
        series_count: info.count,
      };
    });

    const latestDate = rows.length > 0
      ? rows.reduce((max, r) => r.last_date > max ? r.last_date as string : max, '')
      : new Date().toISOString().split('T')[0];

    return { date: latestDate, sources };
  } catch {
    return { date: new Date().toISOString().split('T')[0], sources: [] };
  }
}

async function getConsensus(): Promise<ConsensusResult | null> {
  try {
    const { rows } = await sql`
      SELECT s.id, s.name, sr.signal, sr.rating_score, sr.robustness_score
      FROM strategies s
      JOIN saved_strategies ss ON s.id = ss.strategy_id
      JOIN strategy_results sr ON s.id = sr.strategy_id
      ORDER BY sr.rating_score DESC
    `;

    if (rows.length === 0) return null;

    const top = rows[0];
    const totalWeight = rows.reduce((sum, r) => sum + (r.rating_score as number), 0);

    const allocationMap: Record<Asset, number> = { GLD: 0, SLV: 0, QQQ: 0, Cash: 0 };
    const breakdownMap: Record<Asset, { name: string; rating: number }[]> = { GLD: [], SLV: [], QQQ: [], Cash: [] };

    for (const row of rows) {
      const asset = row.signal as Asset;
      const rating = row.rating_score as number;
      allocationMap[asset] += rating;
      breakdownMap[asset].push({ name: row.name as string, rating });
    }

    // Convert to percentages
    for (const asset of Object.keys(allocationMap) as Asset[]) {
      allocationMap[asset] = totalWeight > 0 ? (allocationMap[asset] / totalWeight) * 100 : 0;
    }

    const consensusAsset = (Object.entries(allocationMap) as [Asset, number][])
      .sort((a, b) => b[1] - a[1])[0][0];

    const agreementWeight = rows
      .filter(r => r.signal === consensusAsset)
      .reduce((sum, r) => sum + (r.rating_score as number), 0);

    return {
      current_position: top.signal as Asset,
      current_strategy_name: top.name as string,
      current_strategy_rating: top.rating_score as number,
      current_strategy_robustness: top.robustness_score as number,
      weighted_allocation: allocationMap,
      allocation_breakdown: (Object.entries(breakdownMap) as [Asset, { name: string; rating: number }[]][])
        .filter(([, strats]) => strats.length > 0)
        .map(([asset, strategies]) => ({
          asset,
          pct: allocationMap[asset],
          strategies,
        }))
        .sort((a, b) => b.pct - a.pct),
      agreement_pct: totalWeight > 0 ? (agreementWeight / totalWeight) * 100 : 0,
    };
  } catch {
    return null;
  }
}

async function getStrategyAgreement() {
  try {
    const { rows } = await sql`
      SELECT s.name, sr.signal, sr.rating_score, sr.robustness_score
      FROM strategies s
      JOIN saved_strategies ss ON s.id = ss.strategy_id
      JOIN strategy_results sr ON s.id = sr.strategy_id
      ORDER BY sr.rating_score DESC
    `;
    return rows.map(r => ({
      name: r.name as string,
      signal: r.signal as Asset,
      rating: r.rating_score as number,
      robustness: r.robustness_score as number,
    }));
  } catch {
    return [];
  }
}

async function getIndicators() {
  try {
    const fredData: Record<string, FredRow[]> = {};
    const seriesIds = INDICATOR_CONFIGS.map(c => c.fred_series).filter(Boolean) as string[];
    for (const seriesId of seriesIds) {
      const { rows } = await sql`
        SELECT date::text, value FROM fred_data WHERE series_id = ${seriesId} ORDER BY date ASC
      `;
      fredData[seriesId] = rows as FredRow[];
    }
    const { rows: metaRows } = await sql`SELECT series_id, last_updated::text FROM data_metadata WHERE source = 'fred'`;
    return buildIndicatorSnapshots(fredData, metaRows as { series_id: string; last_updated: string }[]);
  } catch {
    return [];
  }
}

export default async function RadarPage() {
  const [dataHealth, consensus, agreements, indicators] = await Promise.all([
    getDataHealth(),
    getConsensus(),
    getStrategyAgreement(),
    getIndicators(),
  ]);

  const regimeScores = indicators.length > 0 ? computeRegimeScores(indicators) : [];
  const indicatorAlerts = indicators.length > 0 ? generateIndicatorAlerts(indicators) : [];

  return (
    <RadarClient
      dataHealth={dataHealth}
      consensus={consensus}
      agreements={agreements}
      regimeScores={regimeScores}
      indicatorAlerts={indicatorAlerts}
    />
  );
}
