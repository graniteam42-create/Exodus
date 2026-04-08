import { sql } from '@vercel/postgres';
import { INDICATOR_CONFIGS, buildIndicatorSnapshots } from '@/lib/indicators';
import IndicatorCard from '@/components/IndicatorCard';
import type { FredRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

async function getIndicatorData() {
  try {
    // Fetch all FRED data and metadata
    const fredData: Record<string, FredRow[]> = {};
    const seriesIds = INDICATOR_CONFIGS.map(c => c.fred_series).filter(Boolean) as string[];

    for (const seriesId of seriesIds) {
      const { rows } = await sql`
        SELECT date::text, value FROM fred_data
        WHERE series_id = ${seriesId}
        ORDER BY date ASC
      `;
      fredData[seriesId] = rows as FredRow[];
    }

    const { rows: metaRows } = await sql`
      SELECT series_id, last_updated::text FROM data_metadata WHERE source = 'fred'
    `;

    return buildIndicatorSnapshots(fredData, metaRows as { series_id: string; last_updated: string }[]);
  } catch {
    return [];
  }
}

async function getTechnicalData() {
  try {
    const tickers = ['GLD.US', 'SLV.US', 'QQQ.US'];
    const result: Record<string, { price: number; sma50: number; sma200: number; rsi: number; return12m: number; drawdown: number }> = {};

    for (const ticker of tickers) {
      const { rows } = await sql`
        SELECT date::text, close, adjusted_close FROM price_data
        WHERE ticker = ${ticker}
        ORDER BY date DESC
        LIMIT 300
      `;

      if (rows.length < 200) {
        result[ticker.split('.')[0]] = { price: 0, sma50: 0, sma200: 0, rsi: 0, return12m: 0, drawdown: 0 };
        continue;
      }

      const prices = rows.map(r => r.adjusted_close as number).reverse();
      const currentPrice = prices[prices.length - 1];
      const sma50 = prices.slice(-50).reduce((a, b) => a + b, 0) / 50;
      const sma200 = prices.slice(-200).reduce((a, b) => a + b, 0) / 200;

      // RSI(14)
      const changes = [];
      for (let i = prices.length - 15; i < prices.length; i++) {
        changes.push(prices[i] - prices[i - 1]);
      }
      const gains = changes.filter(c => c > 0);
      const losses = changes.filter(c => c < 0).map(c => -c);
      const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / 14 : 0;
      const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / 14 : 0.001;
      const rs = avgGain / avgLoss;
      const rsi = 100 - (100 / (1 + rs));

      // 12-month return (~252 days)
      const return12m = prices.length >= 252 ? (currentPrice / prices[prices.length - 252] - 1) : 0;

      // Drawdown from 52-week high
      const high52w = Math.max(...prices.slice(-252));
      const drawdown = (currentPrice - high52w) / high52w;

      const label = ticker.split('.')[0];
      result[label] = { price: currentPrice, sma50, sma200, rsi, return12m, drawdown };
    }

    return result;
  } catch {
    return {};
  }
}

export default async function IndicatorsPage() {
  const indicators = await getIndicatorData();
  const technicals = await getTechnicalData();

  const categories: { key: string; label: string }[] = [
    { key: 'rates', label: 'Rates & Yield Curve' },
    { key: 'credit', label: 'Credit & Financial Conditions' },
    { key: 'labor', label: 'Labor Market' },
    { key: 'inflation', label: 'Inflation' },
    { key: 'volatility', label: 'Volatility' },
    { key: 'liquidity', label: 'Liquidity' },
  ];

  return (
    <div>
      {indicators.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ color: 'var(--text-muted)' }}>No indicator data available. Click &quot;Refresh Data&quot; on the Radar page to fetch data from FRED and EODHD.</p>
        </div>
      )}

      {categories.map(cat => {
        const catIndicators = indicators.filter(i => i.category === cat.key);
        if (catIndicators.length === 0) return null;
        return (
          <div key={cat.key}>
            <div className="indicator-section-header">{cat.label}</div>
            <div className="indicator-grid">
              {catIndicators.map(ind => (
                <IndicatorCard key={ind.id} indicator={ind} />
              ))}
            </div>
          </div>
        );
      })}

      {/* Technical Indicators */}
      {Object.keys(technicals).length > 0 && (
        <>
          <div className="indicator-section-header">Technical Indicators by Asset</div>
          <div className="card" style={{ padding: 12 }}>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr><th>Indicator</th><th>GLD</th><th>SLV</th><th>QQQ</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Price</td>
                    {['GLD', 'SLV', 'QQQ'].map(t => (
                      <td key={t} className="mono">${technicals[t]?.price?.toFixed(2) ?? '—'}</td>
                    ))}
                  </tr>
                  <tr>
                    <td>vs SMA200</td>
                    {['GLD', 'SLV', 'QQQ'].map(t => {
                      const d = technicals[t];
                      if (!d || !d.sma200) return <td key={t}>—</td>;
                      const pct = ((d.price - d.sma200) / d.sma200) * 100;
                      return (
                        <td key={t} className="mono" style={{ color: pct > 0 ? 'var(--green-light)' : 'var(--red)' }}>
                          {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    <td>RSI(14)</td>
                    {['GLD', 'SLV', 'QQQ'].map(t => (
                      <td key={t} className="mono">{technicals[t]?.rsi?.toFixed(1) ?? '—'}</td>
                    ))}
                  </tr>
                  <tr>
                    <td>12-Month Return</td>
                    {['GLD', 'SLV', 'QQQ'].map(t => {
                      const r = technicals[t]?.return12m ?? 0;
                      return (
                        <td key={t} className="mono" style={{ color: r > 0 ? 'var(--green-light)' : 'var(--red)' }}>
                          {r > 0 ? '+' : ''}{(r * 100).toFixed(1)}%
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    <td>Drawdown from 52w High</td>
                    {['GLD', 'SLV', 'QQQ'].map(t => {
                      const d = technicals[t]?.drawdown ?? 0;
                      return (
                        <td key={t} className="mono" style={{ color: d < -0.05 ? 'var(--red)' : 'var(--green-light)' }}>
                          {(d * 100).toFixed(1)}%
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Cross-Asset Ratios */}
      {Object.keys(technicals).length > 0 && (
        <>
          <div className="indicator-section-header">Cross-Asset Ratios</div>
          <div className="card" style={{ padding: 12 }}>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr><th>Ratio</th><th>Current</th><th>Signal Level</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {technicals['GLD'] && technicals['SLV'] && technicals['SLV'].price > 0 && (
                    <tr>
                      <td>Gold/Silver Ratio</td>
                      <td className="mono" style={{ fontWeight: 600 }}>{(technicals['GLD'].price / technicals['SLV'].price).toFixed(1)}</td>
                      <td className="mono">&gt;80 = SLV undervalued</td>
                      <td>
                        <span className={`badge ${technicals['GLD'].price / technicals['SLV'].price > 80 ? 'badge-amber' : 'badge-green'}`}>
                          {technicals['GLD'].price / technicals['SLV'].price > 80 ? 'Silver cheap' : 'Normal'}
                        </span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
