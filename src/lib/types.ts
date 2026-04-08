// ===== CORE TYPES =====

export type Asset = 'GLD' | 'SLV' | 'QQQ' | 'Cash';

export type RuleCategory = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L' | 'M';

export interface RuleDefinition {
  id: string;               // e.g., "A1", "F10"
  category: RuleCategory;
  name: string;
  condition: string;         // human-readable condition
  asset: Asset;              // what asset this rule favors
  thesis: string;            // economic thesis
  evaluate: (data: MarketData, date: string) => boolean;
}

export interface MarketData {
  prices: Record<string, PriceRow[]>;      // ticker -> daily prices
  fred: Record<string, FredRow[]>;         // series_id -> values
  computed: Record<string, number[]>;      // pre-computed indicators (SMA, RSI, etc.)
}

export interface PriceRow {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjusted_close: number;
}

export interface FredRow {
  date: string;
  value: number;
}

// ===== STRATEGY TYPES =====

export interface Strategy {
  id: string;
  name: string;
  rules: string[];           // rule IDs e.g. ["A1", "F1", "F10", "E2"]
  rule_logic: 'majority' | 'all' | 'any';  // how rules combine
  created_at: string;
  discovery_run_id?: string;
}

export interface StrategyResult {
  strategy_id: string;
  signal: Asset;             // current signal
  rating_score: number;      // 0-100
  rating_grade: string;      // A+, A, A-, B+, etc.
  robustness_score: number;  // 0-100
  robustness_grade: string;
  cagr: number;
  sharpe: number;
  max_drawdown: number;
  profit_factor: number;
  trades_per_year: number;
  total_trades: number;
  cpcv_pass_rate: number;    // e.g., 0.93 = 26/28
  dsr: number;
  pbo: number;
  sensitivity_pass: boolean;
  saved: boolean;
  saved_at?: string;
}

export interface TradeRecord {
  from_date: string;
  to_date: string;
  holding: Asset;
  days: number;
  return_pct: number;
  good_call: boolean;
}

export interface PeriodBreakdown {
  period: string;
  strategy_return: number;
  gld_return: number;
  slv_return: number;
  qqq_return: number;
  sharpe: number;
  max_dd: number;
}

export interface LiveTrackRecord {
  saved_at: string;
  live_days: number;
  trust_level: 'too_early' | 'preliminary' | 'developing' | 'established' | 'mature';
  strategy_return: number;
  gld_return: number;
  slv_return: number;
  qqq_return: number;
  live_trades: number;
}

// ===== RATING/GRADING =====

export type Grade = 'A+' | 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'C-' | 'D+' | 'D' | 'D-' | 'F';

export function scoreToGrade(score: number): Grade {
  if (score >= 97) return 'A+';
  if (score >= 93) return 'A';
  if (score >= 90) return 'A-';
  if (score >= 87) return 'B+';
  if (score >= 83) return 'B';
  if (score >= 80) return 'B-';
  if (score >= 77) return 'C+';
  if (score >= 73) return 'C';
  if (score >= 70) return 'C-';
  if (score >= 67) return 'D+';
  if (score >= 63) return 'D';
  if (score >= 60) return 'D-';
  return 'F';
}

export function gradeColor(grade: Grade): string {
  if (grade.startsWith('A')) return 'var(--green-light)';
  if (grade.startsWith('B')) return 'var(--amber)';
  if (grade.startsWith('C')) return 'var(--orange)';
  if (grade.startsWith('D')) return 'var(--red)';
  return 'var(--red)';
}

// ===== INDICATOR TYPES =====

export type SignalDirection = 'bullish' | 'bearish' | 'neutral';

export interface IndicatorConfig {
  id: string;
  fred_series?: string;
  name: string;
  category: 'rates' | 'credit' | 'labor' | 'inflation' | 'volatility' | 'liquidity';
  unit: string;
  range_min: number;
  range_max: number;
  invert_gradient?: boolean;  // true if lower = worse (e.g., yield curve)
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  interpret: (value: number, prevValue: number | null, data: FredRow[]) => {
    valueSignal: SignalDirection;
    valueText: string;
    trendSignal: SignalDirection;
    trendText: string;
    status: 'safe' | 'watch' | 'elevated' | 'critical';
  };
}

export interface IndicatorSnapshot {
  id: string;
  name: string;
  category: string;
  series_id: string;
  current_value: number;
  prev_value: number | null;
  value_signal: SignalDirection;
  value_text: string;
  trend_signal: SignalDirection;
  trend_text: string;
  status: string;
  freshness: 'live' | 'recent' | 'lagged' | 'stale';
  last_updated: string;
  range_min: number;
  range_max: number;
  gradient_position: number;  // 0-100
  invert_gradient: boolean;
}

// ===== REGIME TYPES =====

export type RegimePhase = 'late_cycle' | 'warning' | 'crisis' | 'bottoming' | 'recovery';

export interface RegimeScore {
  phase: RegimePhase;
  label: string;
  match_pct: number;
  indicators: { name: string; match: boolean; detail: string }[];
}

// ===== DATA HEALTH =====

export interface DataSourceHealth {
  source: string;
  status: 'ok' | 'lagged' | 'stale' | 'error';
  last_updated: string;
  series_count: number;
  detail?: string;
}

// ===== DISCOVERY =====

export interface DiscoveryConfig {
  max_rules_per_strategy: number;
  max_strategies: number;
}

export interface DiscoveryProgress {
  phase: string;
  pct: number;
  generated: number;
  cpcv_passed: number;
  dsr_passed: number;
  final: number;
  done: boolean;
}

// ===== CONSENSUS =====

export interface ConsensusResult {
  current_position: Asset;
  current_strategy_name: string;
  current_strategy_rating: number;
  current_strategy_robustness: number;
  weighted_allocation: Record<Asset, number>;  // asset -> percentage 0-100
  allocation_breakdown: { asset: Asset; pct: number; strategies: { name: string; rating: number }[] }[];
  agreement_pct: number;
}
