/**
 * FRED (Federal Reserve Economic Data) API fetcher.
 *
 * Requires the FRED_API_KEY environment variable.
 */

export interface FredSeriesConfig {
  id: string;
  name: string;
  category: string;
  frequency: 'daily' | 'weekly' | 'monthly';
}

/**
 * All 23 FRED series used by Exodus, organised by category.
 */
export const FRED_SERIES: FredSeriesConfig[] = [
  // Rates & Yield Curve
  { id: 'T10Y2Y',   name: '10Y-2Y Treasury Spread',            category: 'rates',     frequency: 'daily'   },
  { id: 'T10Y3M',   name: '10Y-3M Treasury Spread',            category: 'rates',     frequency: 'daily'   },
  { id: 'DFII10',   name: '10Y Real Yield (TIPS)',              category: 'rates',     frequency: 'daily'   },
  { id: 'T10YIE',   name: '10Y Breakeven Inflation',           category: 'rates',     frequency: 'daily'   },
  { id: 'DGS10',    name: '10-Year Treasury Rate',              category: 'rates',     frequency: 'daily'   },
  { id: 'DGS2',     name: '2-Year Treasury Rate',               category: 'rates',     frequency: 'daily'   },
  { id: 'DGS3MO',   name: '3-Month Treasury Rate',              category: 'rates',     frequency: 'daily'   },
  { id: 'FEDFUNDS', name: 'Federal Funds Effective Rate',       category: 'rates',     frequency: 'monthly' },

  // Credit & Spreads
  { id: 'BAMLH0A0HYM2', name: 'High Yield OAS Spread',         category: 'credit',    frequency: 'daily'   },
  { id: 'NFCI',         name: 'Chicago Fed Financial Conditions', category: 'credit',  frequency: 'weekly'  },
  { id: 'DRTSCILM',     name: 'Bank Lending Standards (C&I)',   category: 'credit',    frequency: 'monthly' },

  // Liquidity
  { id: 'M2SL',      name: 'M2 Money Supply',                   category: 'liquidity', frequency: 'monthly' },
  { id: 'WALCL',     name: 'Fed Balance Sheet (Total Assets)',   category: 'liquidity', frequency: 'weekly'  },
  { id: 'RRPONTSYD', name: 'Overnight Reverse Repo',            category: 'liquidity', frequency: 'daily'   },

  // Labor
  { id: 'SAHMREALTIME', name: 'Sahm Rule Recession Indicator',  category: 'labor',     frequency: 'monthly' },
  { id: 'ICSA',         name: 'Initial Jobless Claims',         category: 'labor',     frequency: 'weekly'  },
  { id: 'CCSA',         name: 'Continuing Jobless Claims',      category: 'labor',     frequency: 'weekly'  },
  { id: 'UNRATE',       name: 'Unemployment Rate',              category: 'labor',     frequency: 'monthly' },

  // Inflation
  { id: 'CPIAUCSL', name: 'CPI (All Urban Consumers)',          category: 'inflation', frequency: 'monthly' },
  { id: 'CPILFESL', name: 'Core CPI (Less Food & Energy)',      category: 'inflation', frequency: 'monthly' },

  // Sentiment & Volatility
  { id: 'UMCSENT', name: 'U. of Michigan Consumer Sentiment',   category: 'sentiment', frequency: 'monthly' },
  { id: 'VIXCLS',  name: 'CBOE Volatility Index (VIX)',         category: 'volatility', frequency: 'daily'  },

  // Recession
  { id: 'RECPROUSM156N', name: 'Recession Probabilities',       category: 'recession', frequency: 'monthly' },
];

const FRED_BASE_URL = 'https://api.stlouisfed.org/fred/series/observations';

/**
 * Fetch observation data for a single FRED series.
 *
 * @param seriesId  FRED series identifier (e.g. "T10Y2Y")
 * @param startDate Optional ISO date string (YYYY-MM-DD). Defaults to 2000-01-01.
 * @returns Array of {date, value} objects, filtering out rows with missing (".")
 *          values that FRED returns for holidays / non-reporting days.
 */
export async function fetchFredSeries(
  seriesId: string,
  startDate?: string,
): Promise<{ date: string; value: number }[]> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    throw new Error('FRED_API_KEY environment variable is not set');
  }

  const observationStart = startDate ?? '2000-01-01';

  const url = new URL(FRED_BASE_URL);
  url.searchParams.set('series_id', seriesId);
  url.searchParams.set('observation_start', observationStart);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('file_type', 'json');

  const response = await fetch(url.toString());

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `FRED API error for ${seriesId}: ${response.status} ${response.statusText} — ${text}`,
    );
  }

  const json = (await response.json()) as {
    observations: { date: string; value: string }[];
  };

  // FRED uses "." for missing / not-yet-reported values — skip those.
  return json.observations
    .filter((obs) => obs.value !== '.')
    .map((obs) => ({
      date: obs.date,
      value: parseFloat(obs.value),
    }));
}
