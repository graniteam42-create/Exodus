import { sql } from '@vercel/postgres';

/**
 * Initialize all database tables. Safe to call multiple times —
 * every statement uses IF NOT EXISTS.
 */
export async function initializeDatabase(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS price_data (
      id SERIAL PRIMARY KEY,
      ticker VARCHAR(20) NOT NULL,
      date DATE NOT NULL,
      open FLOAT,
      high FLOAT,
      low FLOAT,
      close FLOAT,
      volume BIGINT,
      adjusted_close FLOAT,
      UNIQUE(ticker, date)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS fred_data (
      id SERIAL PRIMARY KEY,
      series_id VARCHAR(30) NOT NULL,
      date DATE NOT NULL,
      value FLOAT,
      UNIQUE(series_id, date)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS data_metadata (
      id SERIAL PRIMARY KEY,
      source VARCHAR(20) NOT NULL,
      series_id VARCHAR(30) UNIQUE NOT NULL,
      last_updated TIMESTAMP,
      first_date DATE,
      last_date DATE,
      row_count INT DEFAULT 0
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS strategies (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255),
      rules JSONB,
      rule_logic VARCHAR(20) DEFAULT 'majority',
      created_at TIMESTAMP DEFAULT NOW(),
      discovery_run_id VARCHAR(64)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS strategy_results (
      id SERIAL PRIMARY KEY,
      strategy_id VARCHAR(64) REFERENCES strategies(id),
      signal VARCHAR(10),
      rating_score FLOAT,
      rating_grade VARCHAR(5),
      robustness_score FLOAT,
      robustness_grade VARCHAR(5),
      cagr FLOAT,
      sharpe FLOAT,
      max_drawdown FLOAT,
      profit_factor FLOAT,
      trades_per_year FLOAT,
      total_trades INT,
      cpcv_pass_rate FLOAT,
      dsr FLOAT,
      pbo FLOAT,
      sensitivity_pass BOOLEAN,
      computed_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS saved_strategies (
      strategy_id VARCHAR(64) PRIMARY KEY REFERENCES strategies(id),
      saved_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS trades (
      id SERIAL PRIMARY KEY,
      strategy_id VARCHAR(64),
      from_date DATE,
      to_date DATE,
      holding VARCHAR(10),
      days INT,
      return_pct FLOAT,
      good_call BOOLEAN
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS period_breakdowns (
      id SERIAL PRIMARY KEY,
      strategy_id VARCHAR(64),
      period VARCHAR(30),
      strategy_return FLOAT,
      gld_return FLOAT,
      slv_return FLOAT,
      qqq_return FLOAT,
      sharpe FLOAT,
      max_dd FLOAT
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS discovery_runs (
      id VARCHAR(64) PRIMARY KEY,
      started_at TIMESTAMP,
      completed_at TIMESTAMP,
      config JSONB,
      strategies_tested INT DEFAULT 0,
      strategies_passed INT DEFAULT 0,
      best_rating FLOAT
    )
  `;
}

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

/**
 * Run an arbitrary SQL query. Wraps the @vercel/postgres sql tagged template
 * for cases where you need dynamic table/column references.
 */
export async function query(text: string, params: unknown[] = []) {
  // @vercel/postgres doesn't expose a raw query helper on `sql`, so we
  // use the pool directly via the `db` export.
  const { db } = await import('@vercel/postgres');
  const client = await db.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

/**
 * Get the most recent date stored for a given data source and series.
 * Returns null if no data exists yet.
 */
export async function getLatestDate(
  source: string,
  seriesId: string,
): Promise<string | null> {
  const result = await sql`
    SELECT last_date
    FROM data_metadata
    WHERE source = ${source} AND series_id = ${seriesId}
  `;
  if (result.rows.length === 0) return null;
  const d = result.rows[0].last_date;
  if (!d) return null;
  // Normalise to YYYY-MM-DD string
  return typeof d === 'string' ? d : (d as Date).toISOString().slice(0, 10);
}

/**
 * Upsert the metadata row for a data source / series after a refresh.
 */
export async function upsertDataMetadata(
  source: string,
  seriesId: string,
  lastDate: string,
  rowCount: number,
): Promise<void> {
  await sql`
    INSERT INTO data_metadata (source, series_id, last_updated, last_date, row_count)
    VALUES (${source}, ${seriesId}, NOW(), ${lastDate}::date, ${rowCount})
    ON CONFLICT (series_id)
    DO UPDATE SET
      last_updated = NOW(),
      last_date = ${lastDate}::date,
      row_count = ${rowCount}
  `;
}
