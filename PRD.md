# EXODUS — Complete PRD

## Project Vision
A personal investment timing web app deployed on Vercel. Helps time tactical allocation across Gold, Silver, QQQ, and Cash using hypothesis-driven strategies validated with rigorous anti-overfitting methods. Not a daytrading tool — a regime-awareness tool for a long-term investor who wants to avoid major drawdowns.

The user is bearish for the years to come, believes in AI but thinks there's an AI bubble, and invests primarily in gold, silver, some tech stocks, and natural resources. The goal is to avoid big slumps and improve performance by timing allocations.

---

## Decisions Made

### Assets (Final: 4 assets)
- **GLD (Gold)** — crisis hedge, inflation hedge, monetary debasement protection
- **SLV (Silver)** — industrial + monetary, high-beta precious metal for recovery phases
- **QQQ (Nasdaq 100)** — growth/AI exposure when risk-on
- **Cash (flat 0% return)** — capital preservation, keeps scoring honest since every dollar of return must be actively earned

#### Rejected alternatives:
- **Copper (COPX)** — dropped because it's pro-cyclical, crashes in recessions, doesn't help defensive positioning
- **TLT (Long-term Treasuries)** — surged +33% in 2008 and +22% in 2020, BUT collapsed -30% in 2022 (inflationary bear market). Only works in deflationary crises. Dealbreaker if next crisis involves inflation/stagflation.
- **DBMF/KMLM (Managed Futures)** — interesting (+24-28% in 2022 when everything else fell, +18% in 2008), but launched 2019-2021 so insufficient backtest history for the validation pipeline.
- **UUP (Dollar)** — decent diversifier (+15-20% in crises) but gains are modest, has negative carry cost.
- **VIX products (VIXY, VXX)** — surge enormously in crashes but bleed 50-80% per year from contango. Untradeable as allocation.

Four assets is also a feature for overfitting prevention — fewer choices = fewer ways to get lucky.

---

## Data Sources

### EODHD ($20/mo) — Price Data:
- **GLD.US, SLV.US, QQQ.US** (traded assets)
- **UUP.US** (DXY/dollar proxy for cross-asset rules)
- **COPX.US** (copper proxy for copper/gold ratio — we don't trade it but use as indicator)
- **SPY.US** (broad market reference)

> **Important:** correct EODHD symbol for gold futures is `GC.COMM` not `GC.COMEX` (learned from prior app bug)

### FRED (free) — 23 Macro Series:

| FRED Series | Description | Update Frequency |
|---|---|---|
| T10Y2Y | 10Y-2Y Treasury Spread | Daily |
| T10Y3M | 10Y-3M Treasury Spread | Daily |
| DFII10 | 10Y TIPS Real Yield | Daily |
| T10YIE | 10Y Breakeven Inflation | Daily |
| BAMLH0A0HYM2 | ICE BofA HY OAS Spread | Daily |
| M2SL | M2 Money Supply | Monthly (lagged) |
| SAHMREALTIME | Sahm Rule Indicator | Monthly |
| UMCSENT | Michigan Consumer Sentiment | Monthly |
| NFCI | Chicago Fed Financial Conditions | Weekly |
| DRTSCILM | Bank Lending Standards (SLOOS) | Quarterly |
| WALCL | Fed Total Assets (Balance Sheet) | Weekly |
| RRPONTSYD | Reverse Repo Usage | Daily |
| VIXCLS | VIX Close | Daily |
| ICSA | Initial Jobless Claims | Weekly |
| CCSA | Continuing Claims | Weekly |
| UNRATE | Unemployment Rate | Monthly |
| CPIAUCSL | CPI All Items | Monthly |
| CPILFESL | Core CPI | Monthly |
| FEDFUNDS | Fed Funds Rate | Monthly |
| DGS10 | 10-Year Treasury Yield | Daily |
| DGS2 | 2-Year Treasury Yield | Daily |
| DGS3MO | 3-Month Treasury Yield | Daily |
| RECPROUSM156N | Smoothed Recession Probabilities | Monthly |

**No fallbacks** — if EODHD or FRED fails, show a clear error "Data fetch failed from [source]: [error details]". No silent use of Yahoo Finance or Stooq.

### Data caching strategy:
- **First launch:** download full history from EODHD + FRED, store in Vercel Postgres with `last_updated` timestamp per series. Target start date: ~2000 (or earliest available per series). EODHD likely has QQQ from 1999, GLD from 2004, SLV from 2006. FRED macro series mostly available from 2000 or earlier. Some indicators need a calculation buffer (e.g., 200-day SMA needs 200 trading days). **NOTE: exact start dates to be confirmed once data is fetched — adjust backtest period accordingly.**
- **Daily refresh** (button or cron): for each series, `SELECT MAX(date)`, then fetch only `from=max_date+1` from APIs. Append only new rows. ~1-2 API calls per series, seconds not minutes.
- **Off-by-one fix** learned from prior app: fetch from `last_date + 1 day`, not `last_date` (avoids duplicating the last row)
- **"No update in 48hrs" warning** on Radar page when data pipeline silently fails

---

## Architecture

### Vercel deployment (daily use):
- Next.js app on Vercel free tier (60s serverless timeout)
- Radar, Discovery, Strategies, Indicators pages work from cached data in Vercel Postgres
- Data refresh via "Refresh Data" button (calls FRED + EODHD APIs via serverless functions, appends to DB)
- Discovery page shows "Discovery requires local mode" with setup instructions

### Local mode (discovery):
- Same Next.js app run locally via double-click launcher (.bat on Windows, .command on Mac — no terminal knowledge needed)
- Opens browser to localhost:3000 — full app with "Discovery" tab active
- "Run Discovery" button triggers Python child process for strategy generation
- Progress streams to the browser
- Results write to Vercel Postgres — deployed app immediately sees new strategies
- No command line needed at any point

### Storage:
- Vercel Postgres (free tier: 256MB) for strategies, indicator cache, user settings
- Strategies persist across deploys, browser refreshes, device changes
- Local discovery script exports results directly to the cloud database

### Authentication:
- Single shared password for all access
- Simple full-screen password input before anything loads

---

## Execution Model
- Signal generated on day T based on close price
- Executed at day T+1 close price (1-day delay)
- 10 trading day minimum hold (~2 weeks)
- 10 basis points (0.1%) cost per trade
- Every strategy must be **fully serializable** — all parameters, all thresholds, all defaults stored explicitly in the database. No implicit defaults anywhere. When you load a strategy, it must produce identical results every time. (Lesson from prior app's biggest bug: non-determinism from lost parameters on export/import)

### Live Track Record

Every saved strategy starts a live track record from the date it's saved. This is the only genuinely uncontaminated performance data — the strategy was designed before this period, so it cannot be overfit to it.

**Tracked metrics (from save date forward):**
- Date saved, days since saved
- Cumulative return since saved
- Return vs. each individual asset (GLD, SLV, QQQ, Cash) over the same period
- Number of live trades made
- Live Sharpe ratio (once enough data: 60+ trading days)
- Live Profit Factor (once enough trades: 5+)

**Trust progression:**
- < 30 days: "Too early to evaluate" — not shown as meaningful
- 30-90 days: "Preliminary" — shown but with caveat
- 90-180 days: "Developing" — starting to be informative  
- 180-365 days: "Established" — meaningful track record
- 365+ days: "Mature" — high-trust performance data

**Display:** Live Track Record appears as a section in the strategy detail view (both in Discovery pool expansion and Strategies saved cards). Shows a simple comparison: strategy return vs each asset over the live period.

**Important:** Live Track Record is purely observational — it does NOT affect the Rating or Robustness scores, which are based on the full historical backtest. A strategy with a bad first month of live performance but strong Robustness (A+) should not be abandoned — short live periods are noisy.

---

## Rule Library (~150 rules, 13 categories)

Each rule has an economic thesis explaining WHY it should work. This is the foundation of the anti-overfitting approach — no random generation, only economically motivated hypotheses.

### CATEGORY A: Yield Curve & Interest Rates (15 rules)

| # | Rule | Condition | Asset | Thesis |
|---|---|---|---|---|
| A1 | Yield curve inversion | 10Y-2Y spread < 0 | GLD | Recession signal → risk off, gold benefits |
| A2 | Yield curve deep inversion | 10Y-2Y spread < -0.5% | Cash | Deep inversion = recession imminent, preserve capital |
| A3 | Yield curve steepening from inversion | 10Y-2Y was negative, now rising for 3+ months | QQQ | Steepening after inversion = early recovery. IMPORTANT: recessions historically begin AFTER the curve steepens back (dis-inversion is more dangerous than inversion itself) |
| A4 | Yield curve bull steepening | 10Y falling faster than 2Y | GLD | Flight to safety driving long rates down |
| A5 | Yield curve bear steepening | 10Y rising faster than 2Y | GLD | Fiscal concerns, inflation fears → gold |
| A6 | Fed cutting cycle begins | Fed funds rate drops 25bp+ from cycle peak | GLD | Easing = real rates declining → gold positive. Research shows gold +15.5% in 12 months if recession follows the cut |
| A7 | Fed aggressive cutting | Fed funds rate down 100bp+ in 6 months | QQQ | Aggressive easing = bottom may be near for risk assets |
| A8 | Fed hiking cycle | Fed funds rate up 50bp+ in 6 months | Cash | Tightening headwind for all assets |
| A9 | Fed on hold after hiking | Fed funds unchanged 6+ months after hikes | QQQ | Pause before cuts historically bullish for equities (+14.2% avg 12mo return since 1984) |
| A10 | Real yields deeply negative | 10Y TIPS yield < -1% | GLD | Bonds losing purchasing power → gold alternative. Correlation between real rates and gold is -0.82 (Erb & Harvey) |
| A11 | Real yields rising sharply | 10Y TIPS yield up 100bp+ in 6 months | Cash | Rising real yields = headwind for gold and stocks. Research: each 100bp rise → ~18% decline in inflation-adjusted gold |
| A12 | Real yields positive and high | 10Y TIPS yield > 2% | Cash | Cash competitive when real yields are high |
| A13 | 3M-10Y inversion | 3M yield > 10Y yield | GLD | Strongest academic recession predictor (NY Fed model, Estrella & Mishkin) |
| A14 | Rate of yield curve change | 10Y-2Y spread falling > 50bp in 3 months | GLD | Rapid flattening = deteriorating outlook |
| A15 | Long rates collapsing | 10Y yield down 100bp+ in 3 months | GLD | Flight to safety in progress |

### CATEGORY B: Credit & Financial Conditions (12 rules)

| # | Rule | Condition | Asset | Thesis |
|---|---|---|---|---|
| B1 | HY spreads elevated | ICE BofA HY OAS > 500bp | GLD | Credit stress → risk off |
| B2 | HY spreads blowing out | HY spread up 200bp+ in 3 months | Cash | Acute credit crisis developing |
| B3 | HY spreads compressing | HY spread down 100bp+ in 3 months from elevated level | QQQ | Credit healing → risk on recovery |
| B4 | HY spreads very tight | HY spread < 300bp | QQQ | Risk appetite high, ride it |
| B5 | HY spreads extremely tight | HY spread < 250bp | Cash | Excessive complacency → late cycle risk. This level was only reached in May 2007 (before GFC), July 2021, and November 2024 |
| B6 | Financial conditions tightening | Chicago Fed NFCI rising above 0 | Cash | Tight financial conditions choke growth |
| B7 | Financial conditions loosening | NFCI falling below -0.5 | QQQ | Easy conditions = risk on |
| B8 | TED spread elevated | TED spread > 50bp (if available) | Cash | Interbank stress |
| B9 | Credit spread acceleration | HY spread rate of change > 20% in 1 month | GLD | Rapid deterioration |
| B10 | IG-to-HY differential widening | HY minus IG spread widening > 100bp in 3 months | Cash | Flight to quality within credit |
| B11 | Bank lending tightening | SLOOS net tightening > 30% | GLD | Banks pulling back → recession risk |
| B12 | Bank lending easing | SLOOS net tightening < 0% | QQQ | Credit expansion → growth |

### CATEGORY C: Labor Market (10 rules)

| # | Rule | Condition | Asset | Thesis |
|---|---|---|---|---|
| C1 | Unemployment rising | Unemployment rate up 0.5%+ from 12-month low | GLD | Sahm Rule trigger area → recession |
| C2 | Unemployment rising fast | Unemployment up 1%+ from cycle low | Cash | Deep recession underway |
| C3 | Unemployment falling steadily | Unemployment down 3+ consecutive months | QQQ | Labor market strength = growth |
| C4 | Initial claims surging | 4-week avg initial claims up 30%+ from low | GLD | Leading labor indicator, recession warning |
| C5 | Initial claims falling from peak | 4-week avg claims down 20%+ from recent peak | QQQ | Recovery in progress |
| C6 | Continuing claims surging | Continuing claims up 20%+ from 6-month low | GLD | Persistent layoffs, recession deepening |
| C7 | Sahm Rule triggered | 3-month avg unemployment 0.5%+ above 12-month low | Cash | Historically 100% recession accuracy since 1950, triggers ~3 months into recession |
| C8 | Employment plateau | Unemployment flat within 0.1% for 6+ months at low level | QQQ | Goldilocks labor market |
| C9 | Claims vs unemployment divergence | Initial claims rising but unemployment still low | GLD | Early warning before unemployment confirms |
| C10 | Unemployment rate above 5% | Unemployment > 5% | Cash | Significant slack → deflationary, defensive |

### CATEGORY D: Inflation & Money Supply (12 rules)

| # | Rule | Condition | Asset | Thesis |
|---|---|---|---|---|
| D1 | CPI accelerating | YoY CPI rising for 3+ months | GLD | Inflation favors gold |
| D2 | CPI above 4% | YoY CPI > 4% | GLD | High inflation regime, gold as store of value |
| D3 | CPI decelerating rapidly | YoY CPI down 1%+ in 6 months | QQQ | Disinflation = potential Fed easing = bullish equities |
| D4 | Core CPI sticky above 3% | Core CPI > 3% for 6+ months | GLD | Sticky inflation erodes real returns → gold |
| D5 | Deflation risk | YoY CPI < 1% and falling | Cash | Deflationary bust, cash preserves |
| D6 | Breakeven inflation rising | 10Y breakeven up 50bp+ in 3 months | GLD | Market pricing in more inflation → gold |
| D7 | Breakeven inflation collapsing | 10Y breakeven down 50bp+ in 3 months | Cash | Deflation fears → risk off |
| D8 | M2 growth strong | YoY M2 growth > 8% | QQQ | Excess liquidity lifts asset prices |
| D9 | M2 contraction | YoY M2 growth < 0% | Cash | Monetary contraction → deflationary, bearish all assets (first occurred in 2022-2023 since mid-1990s) |
| D10 | M2 contraction prolonged | YoY M2 negative for 6+ months | GLD | Extreme monetary stress, flight to hard assets |
| D11 | PPI diverging from CPI | PPI rising while CPI flat | GLD | Producer costs rising = future CPI pressure |
| D12 | Stagflation signal | CPI > 3% AND unemployment rising | GLD | Worst-case scenario for equities, gold benefits |

### CATEGORY E: Volatility & Risk Regime (15 rules)

| # | Rule | Condition | Asset | Thesis |
|---|---|---|---|---|
| E1 | VIX low complacency | VIX < 14 for 20+ days | QQQ | Low vol regime, ride the trend |
| E2 | VIX moderately elevated | VIX between 20-30 | GLD | Heightened uncertainty, defensive |
| E3 | VIX panic spike | VIX > 35 | Cash | Acute panic, wait for dust to settle |
| E4 | VIX extreme panic | VIX > 45 | QQQ | Historically, buying extreme VIX = high forward returns (contrarian) |
| E5 | VIX declining from spike | VIX was > 30, now below 25 and falling | QQQ | Post-panic recovery |
| E6 | VIX term structure inverted | Front-month VIX > next-month VIX | Cash | Market expects near-term turbulence (~20% of time, signals acute stress) |
| E7 | VIX term structure backwardation prolonged | Inverted for 5+ days | GLD | Sustained fear, not just a spike |
| E8 | VIX term structure contango steep | Front/next month ratio < 0.85 | QQQ | Markets expect calm, risk on |
| E9 | Realized vol > implied vol | 20-day realized vol > VIX | Cash | Market underpricing actual risk |
| E10 | VVIX elevated | VVIX > 120 (if available) | Cash | Volatility of volatility = extreme uncertainty. Note: VVIX >= 125 historically correlates with positive QQQ returns 70%+ of the time over following weeks — contrarian signal |
| E11 | Volatility regime shift | VIX 20-day average crosses above 50-day average | GLD | Transitioning to higher vol regime |
| E12 | Gold volatility low + uptrend | GLD 20-day vol < 15% AND GLD > SMA50 | GLD | Low vol uptrend = sustainable gold bull |
| E13 | QQQ volatility compression | QQQ 20-day vol < 10% for 20+ days | QQQ | Compressed vol often precedes continuation |
| E14 | Cross-asset correlation spike | GLD-QQQ rolling 20-day correlation > 0.5 | Cash | All correlations going to 1 = crisis ("selling everything") |
| E15 | Correlation breakdown | GLD-QQQ correlation < -0.3 | GLD | Normal negative correlation = gold is hedging properly |

### CATEGORY F: Technical — Trend & Momentum (20 rules)

Based on Moskowitz, Ooi, Pedersen (2012) "Time Series Momentum" — t-stat ~5 since 1960, significant across 58 instruments. And Lempérière et al. (2014) "Two Centuries of Trend Following" — anomalous excess returns confirmed across 4 asset classes over 200+ years.

| # | Rule | Condition | Asset | Thesis |
|---|---|---|---|---|
| F1 | GLD above 200-day SMA | GLD > SMA200 | GLD | Long-term trend confirmation (most robust single technical indicator academically) |
| F2 | GLD below 200-day SMA | GLD < SMA200 | Cash | Gold downtrend, avoid |
| F3 | QQQ above 200-day SMA | QQQ > SMA200 | QQQ | Bull market confirmed |
| F4 | QQQ below 200-day SMA | QQQ < SMA200 | Cash | Bear market, step aside |
| F5 | SLV above 200-day SMA | SLV > SMA200 | SLV | Silver uptrend |
| F6 | GLD golden cross | SMA50 > SMA200 (GLD) | GLD | Medium-term trend turning up |
| F7 | GLD death cross | SMA50 < SMA200 (GLD) | Cash | Medium-term trend turning down |
| F8 | QQQ golden cross | SMA50 > SMA200 (QQQ) | QQQ | Equity uptrend confirmed |
| F9 | QQQ death cross | SMA50 < SMA200 (QQQ) | Cash | Equity downtrend confirmed |
| F10 | 12-month momentum GLD positive | GLD 12-month return > 0% | GLD | Time-series momentum (Moskowitz et al.) — strongest single momentum signal academically |
| F11 | 12-month momentum QQQ positive | QQQ 12-month return > 0% | QQQ | Time-series momentum |
| F12 | 12-month momentum SLV positive | SLV 12-month return > 0% | SLV | Silver momentum |
| F13 | All assets negative 12-month momentum | GLD, SLV, QQQ all < 0% trailing 12mo | Cash | Everything falling, cash is king |
| F14 | Dual momentum: GLD vs QQQ | GLD 12mo return > QQQ 12mo return AND GLD > 0% | GLD | Antonacci dual momentum: relative + absolute. Academic support across multiple asset classes and decades |
| F15 | Dual momentum: QQQ vs GLD | QQQ 12mo return > GLD 12mo return AND QQQ > 0% | QQQ | Best relative performer with positive absolute |
| F16 | SLV relative strength vs GLD | SLV 3mo return > GLD 3mo return by 5%+ | SLV | Silver outperformance = risk-on precious metals |
| F17 | GLD rate of change strong | GLD 60-day ROC > 10% | GLD | Strong momentum, ride it |
| F18 | QQQ rate of change strong | QQQ 60-day ROC > 10% | QQQ | Strong equity momentum |
| F19 | Volatility-adjusted momentum GLD | GLD return / GLD volatility > 1.0 (annualized) | GLD | Risk-adjusted momentum per Moskowitz; Ilmanen (2011) shows vol-adjusted momentum produces higher Sharpe than raw momentum |
| F20 | Volatility-adjusted momentum QQQ | QQQ return / QQQ volatility > 1.0 (annualized) | QQQ | Risk-adjusted momentum |

### CATEGORY G: Technical — Mean Reversion (12 rules)

| # | Rule | Condition | Asset | Thesis |
|---|---|---|---|---|
| G1 | GLD RSI oversold | GLD RSI(14) < 30 | GLD | Mean reversion after panic selling (58% win rate, +6.8% avg winner on daily backtest 2014-2024) |
| G2 | QQQ RSI oversold | QQQ RSI(14) < 30 | QQQ | Oversold bounce |
| G3 | SLV RSI oversold | SLV RSI(14) < 30 | SLV | Oversold bounce |
| G4 | GLD RSI overbought | GLD RSI(14) > 75 | Cash | Take profits, overbought |
| G5 | QQQ RSI overbought | QQQ RSI(14) > 80 | Cash | Take profits, extreme greed |
| G6 | GLD at lower Bollinger Band | GLD at or below 2-std lower band (20-day) | GLD | Statistical mean reversion. Combined with RSI < 30: 64% win rate |
| G7 | QQQ at lower Bollinger Band | QQQ at or below 2-std lower band | QQQ | Statistical mean reversion |
| G8 | GLD drawdown from 52-week high > 15% | (high - current) / high > 15% | GLD | Deep drawdown = potential opportunity |
| G9 | QQQ drawdown from 52-week high > 20% | Drawdown > 20% | QQQ | Correction territory, historically good entry |
| G10 | QQQ drawdown from 52-week high > 30% | Drawdown > 30% | QQQ | Bear market, historically excellent entry for long-term |
| G11 | Price far above SMA200 QQQ | QQQ > 120% of SMA200 | Cash | Overextended, reversion risk |
| G12 | Price far above SMA200 GLD | GLD > 115% of SMA200 | Cash | Gold overextended |

### CATEGORY H: Cross-Asset & Intermarket (18 rules)

| # | Rule | Condition | Asset | Thesis |
|---|---|---|---|---|
| H1 | Gold/Silver ratio high | GLD/SLV ratio > 80 | SLV | Silver undervalued vs gold, mean reversion. The 80/60 rule: silver rallied 40%, 300%, and 400% the last three times ratio exceeded 80 |
| H2 | Gold/Silver ratio extreme | GLD/SLV ratio > 90 | SLV | Crisis pricing (reached 123 during COVID). Silver catches up aggressively in recovery |
| H3 | Gold/Silver ratio low | GLD/SLV ratio < 65 | GLD | Silver overheated, rotate to gold for safety |
| H4 | Gold/Silver ratio falling fast | GLD/SLV ratio down 10+ in 3 months | SLV | Silver outperformance trend accelerating |
| H5 | Copper/Gold ratio falling | Copper/Gold ratio declining for 3+ months | GLD | Economic slowdown signal (Dr. Copper). Copper/Gold below 0.20 has 94% historical accuracy for recession |
| H6 | Copper/Gold ratio rising | Copper/Gold ratio rising for 3+ months | QQQ | Economic expansion, risk on |
| H7 | DXY strong | DXY proxy (UUP) > 105 | Cash | Strong dollar headwind for gold AND commodities |
| H8 | DXY weakening | DXY down 5%+ from 6-month high | GLD | Weak dollar → gold benefits. Research: 1% dollar decline → ~3.09% gold increase (regime-dependent). CAVEAT: since 2022-2024 gold rose DESPITE dollar strength due to central bank buying |
| H9 | DXY strong + QQQ strong | DXY > 100 AND QQQ > SMA200 | QQQ | Dollar strength from growth, not crisis |
| H10 | DXY breaking down | DXY < SMA200 AND falling | GLD | Dollar downtrend = gold uptrend |
| H11 | Gold outperforming QQQ 6-month | GLD 6mo return > QQQ 6mo return by 10%+ | GLD | Risk-off regime confirmed |
| H12 | QQQ outperforming Gold 6-month | QQQ 6mo return > GLD 6mo return by 10%+ | QQQ | Risk-on regime confirmed |
| H13 | Gold and Silver both trending up | GLD > SMA50 AND SLV > SMA50 | SLV | Precious metals bull = pick the higher-beta one |
| H14 | Gold up, Silver down | GLD > SMA50 AND SLV < SMA50 | GLD | Fear-driven gold rally, silver not confirming = cautious |
| H15 | Everything down | GLD < SMA50 AND SLV < SMA50 AND QQQ < SMA50 | Cash | Broad liquidation event |
| H16 | Everything up | GLD > SMA50 AND SLV > SMA50 AND QQQ > SMA50 | QQQ | Liquidity-driven rally, equities benefit most |
| H17 | Gold relative strength vs all | GLD best performer of 3 assets over 3 months | GLD | Relative momentum, stay with winner |
| H18 | Silver relative strength vs all | SLV best performer of 3 assets over 3 months | SLV | Relative momentum |

### CATEGORY I: Macro Leading Indicators (12 rules)

| # | Rule | Condition | Asset | Thesis |
|---|---|---|---|---|
| I1 | LEI declining | Conference Board LEI down 6+ consecutive months | GLD | Leading indicator of recession. LEI's "3Ds" rule: when 6-month annualized growth < -4.3% AND diffusion index <= 50, recession is imminent. LEI anticipates turning points by ~7 months |
| I2 | LEI deeply negative | LEI YoY change < -5% | Cash | Severe contraction ahead |
| I3 | LEI turning up | LEI rising after 6+ months of decline | QQQ | Early recovery signal |
| I4 | ISM Manufacturing below 50 | ISM PMI < 50 for 3+ months | GLD | Manufacturing contraction |
| I5 | ISM Manufacturing below 45 | ISM PMI < 45 | Cash | Severe contraction |
| I6 | ISM Manufacturing recovering | ISM PMI crosses above 50 from below | QQQ | Expansion resuming |
| I7 | ISM New Orders weak | New Orders sub-index < Inventories sub-index | GLD | Leading indicator of PMI decline |
| I8 | Consumer confidence plunging | Conference Board index down 20%+ in 6 months | GLD | Consumer pullback → recession risk. Current reading (53.3) is below the starting value of ALL six recessions since the survey began |
| I9 | Consumer confidence recovering | Conference Board index up 15%+ from trough | QQQ | Consumer revival |
| I10 | Housing starts declining | Housing starts down 20%+ YoY | GLD | Housing leads the economy by 12-18 months |
| I11 | Retail sales declining | Real retail sales negative YoY | Cash | Consumer recession |
| I12 | Industrial production declining | IP negative YoY for 3+ months | GLD | Broad economic weakening |

> **Note:** Some of these (LEI, ISM, housing starts) may not be available directly from FRED or may need specific series IDs to be identified. Consumer confidence (UMCSENT is Michigan; Conference Board is separate). These should be verified during implementation.

### CATEGORY J: Liquidity & Fed Balance Sheet (10 rules)

| # | Rule | Condition | Asset | Thesis |
|---|---|---|---|---|
| J1 | Fed balance sheet expanding | Fed assets (WALCL) growing YoY > 5% | QQQ | QE / liquidity injection lifts all boats |
| J2 | Fed balance sheet contracting | Fed assets declining YoY (QT) | Cash | Liquidity drain = headwind. Research: QT liquidity effects are roughly DOUBLE those of QE in reverse — each dollar drained has greater effect as total reserves shrink |
| J3 | Fed balance sheet expanding rapidly | Fed assets growing > 20% YoY | QQQ | Emergency QE, massive liquidity |
| J4 | Reverse repo draining | RRP facility declining > $200B in 3 months | QQQ | Liquidity flowing into risk assets |
| J5 | Reverse repo elevated | RRP > $1T | Cash | Excess liquidity parked at Fed, not in markets |
| J6 | NFCI tightening fast | NFCI up 0.5+ in 3 months | Cash | Rapid financial tightening |
| J7 | NFCI very loose | NFCI < -0.5 | QQQ | Easy financial conditions favor risk |
| J8 | Fed emergency action | Fed funds rate cut > 50bp in single meeting | QQQ | Buy when they panic (3-6 month horizon) |
| J9 | Fed credibility stress | Fed funds rate unchanged but 10Y rising > 50bp in 3 months | GLD | Market losing confidence in Fed |
| J10 | Global central bank easing | Multiple major CBs cutting rates (proxy: trend in DXY + rates) | GLD | Global liquidity expansion → gold |

### CATEGORY K: Sentiment & Positioning (10 rules)

> **Note:** AAII, put/call, margin debt may not be available from FRED/EODHD. Flag as optional for v1.

| # | Rule | Condition | Asset | Thesis |
|---|---|---|---|---|
| K1 | AAII bearish extreme | AAII bears > 50% | QQQ | Contrarian: extreme pessimism = buy signal |
| K2 | AAII bullish extreme | AAII bulls > 55% | Cash | Contrarian: extreme optimism = sell signal |
| K3 | Put/call ratio extreme high | Equity put/call ratio > 1.2 | QQQ | Extreme hedging = contrarian buy |
| K4 | Put/call ratio extreme low | Equity put/call ratio < 0.5 | Cash | Extreme complacency = contrarian sell |
| K5 | Bull-bear spread deeply negative | AAII bulls - bears < -20% | QQQ | Historic pessimism = buy |
| K6 | Margin debt declining rapidly | NYSE margin debt down 20%+ YoY | Cash | Deleveraging underway |
| K7 | Margin debt at record high | Margin debt at all-time high + rising | Cash | Excessive leverage = fragile market |
| K8 | Fund flows out of equities | Large equity fund outflows 3+ months | QQQ | Contrarian: retail leaving = opportunity |
| K9 | Fund flows into gold | Gold ETF inflows accelerating | GLD | Smart money positioning for risk-off |
| K10 | Sentiment + macro divergence | AAII bullish > 50% AND yield curve inverted | Cash | Sentiment ignoring macro risk |

### CATEGORY L: Seasonal & Calendar (8 rules)

| # | Rule | Condition | Asset | Thesis |
|---|---|---|---|---|
| L1 | Sell in May (equities) | May-October period | GLD | Historically weaker for stocks. Average returns ~10pp higher Nov-Apr vs May-Oct. Effect has weakened but persists |
| L2 | November-April bullish | November-April period | QQQ | Historically strongest 6 months for equities |
| L3 | January barometer | S&P500 January return negative | GLD | "As goes January, so goes the year" — defensive if Jan negative |
| L4 | September danger zone | September-October | Cash | Historically worst months for equities, crash months |
| L5 | Year 3 of presidential cycle | 3rd year of US presidential cycle | QQQ | Historically strongest year. S&P excess return ~10% higher in years 3-4 vs 1-2 |
| L6 | Gold seasonal strong | Aug-Feb | GLD | Gold historically strongest (jewelry demand + Indian wedding season + Chinese New Year) |
| L7 | Election year uncertainty | June-October of election year | GLD | Political uncertainty favors gold |
| L8 | Quarter-end rebalancing | Last 5 days of quarter | Cash | Institutional rebalancing creates noise |

### CATEGORY M: Composite / Multi-Condition (16 rules)

| # | Rule | Condition | Asset | Thesis |
|---|---|---|---|---|
| M1 | Risk-off regime | VIX > 22 AND yield curve inverted AND HY spreads > 400bp | Cash | Multiple stress indicators aligned |
| M2 | Risk-on regime | VIX < 16 AND QQQ > SMA200 AND HY spreads < 350bp | QQQ | Multiple green lights for risk |
| M3 | Stagflation setup | CPI > 3% AND unemployment rising AND Fed on hold | GLD | Gold's best environment historically |
| M4 | Deflationary bust | CPI falling AND unemployment surging AND VIX > 30 | Cash | Everything falls, cash only |
| M5 | Goldilocks | CPI < 3% AND unemployment < 4.5% AND GDP > 2% | QQQ | Perfect macro for equities |
| M6 | Precious metals bull regime | Real yields < 0% AND DXY falling AND GLD > SMA200 | GLD | Triple confirmation for gold |
| M7 | Silver catch-up trade | GLD/SLV ratio > 80 AND GLD > SMA200 AND SLV > SMA50 | SLV | Silver undervalued in gold bull market |
| M8 | Bear market confirmed | QQQ < SMA200 AND QQQ drawdown > 15% AND VIX > 25 | GLD | Rotate from equities to gold |
| M9 | Recovery entry | QQQ RSI < 35 AND VIX > 30 AND Fed cutting | QQQ | Buy the panic when Fed is supporting |
| M10 | Late cycle excess | VIX < 14 AND HY spread < 300bp AND margin debt at high | Cash | Everything looks great = top is near |
| M11 | Liquidity crisis | VIX > 35 AND HY spreads rising fast AND DXY surging | Cash | Dollar liquidity crisis, cash is king |
| M12 | Inflation trade | CPI rising AND real yields negative AND DXY falling | GLD | Classic inflation hedge environment |
| M13 | Disinflation recovery | CPI falling AND Fed cutting AND QQQ > SMA50 | QQQ | Best equity environment |
| M14 | Commodity supercycle | GLD > SMA200 AND SLV > SMA200 AND DXY < SMA200 | SLV | Broad commodity strength, silver has highest beta |
| M15 | Fear peak reversal | VIX was > 40, now declining AND QQQ RSI < 35 | QQQ | Maximum fear is maximum opportunity |
| M16 | Dollar crisis | DXY down > 10% in 6 months AND M2 growing > 10% | GLD | Monetary debasement, gold's strongest thesis |

**Total: ~150 rules across 13 categories.**

---

## Overfitting Prevention Framework

### The Core Problem

When you test 1,000,000 strategies, even with brutal filters, some will pass by pure luck. This is the multiple hypothesis testing problem.

| Strategies tested | Required Sharpe Ratio to be significant (10yr data) |
|---|---|
| 1 | 0.63 |
| 1,000 | 1.33 |
| 100,000 | 1.60 |
| 1,000,000 | 1.75 |

A strategy with Sharpe 1.5 looks great — but if you tested a million to find it, it's almost certainly noise.

### The Approach: Hypothesis-First, Small Search Space

With ~150 rules and strategies of 3-6 rules, the search space is ~5,000-20,000 combinations — not millions. A Sharpe of 1.0 remains meaningful at this scale.

### Validation Pipeline

**Step 1: CPCV (Combinatorial Purged Cross-Validation)**

From Lopez de Prado's "Advances in Financial Machine Learning":

- Split data into 8 blocks (~2 years each)
- Generate all C(8,2) = 28 train/test combinations
- Each combination trains on 6 blocks, tests on 2
- Purge 15 trading days at block boundaries to prevent leakage
- Embargo additional buffer after purge for serial correlation
- Strategy must be profitable in 24+ of 28 OOS tests (>85%)

CPCV is superior to walk-forward because it produces a distribution of OOS performance (28 tests, not 1), tests every observation OOS in at least one combination, and doesn't waste early data.

**Step 2: Deflated Sharpe Ratio (DSR)**

Bailey & Lopez de Prado (2014). Directly answers: "given that I tested N strategies, is this one's Sharpe still statistically significant?"

```
PSR = Phi((SR_hat - SR*) * sqrt(T-1) / sqrt(1 - skew*SR_hat + (kurtosis-1)/4 * SR_hat^2))
```

Where SR* = expected maximum Sharpe under the null given N trials:

```
E[max_N{SR}] ≈ sqrt(V[SR]) * ((1-γ)*Φ⁻¹(1-1/N) + γ*Φ⁻¹(1-1/(N*e)))
```

The DSR accounts for: number of strategies tested (N), sample length, skewness, fat tails.

Require DSR > 0.95 for Robustness A-range, > 0.90 for Robustness B-range.

**Step 3: Probability of Backtest Overfitting (PBO)**

Bailey, Borwein, Lopez de Prado & Zhu (2017):

- Partition data into S=16 sub-periods
- Generate all C(16,8) = 12,870 IS/OOS combinations
- For each: find best in-sample strategy, check its OOS rank
- PBO = fraction where IS-best underperforms median OOS

Interpretation:
- PBO < 0.15 = acceptable (Robustness A-range)
- PBO < 0.25 = caution (Robustness B-range)
- PBO < 0.35 = moderate (Robustness C-range)
- PBO > 0.50 = likely overfit, discard (Robustness F)

**Step 4: Rule Necessity Test**

Remove each rule from a strategy one at a time. If performance improves or stays flat, that rule is noise — drop it. Every rule must demonstrably contribute.

**Step 5: Parameter Sensitivity Test (Clenow)**

Wiggle every threshold ±20%. If the strategy collapses, it was fit to exact threshold values. A robust strategy works with RSI at 25, 30, or 35 — not only exactly 30.

**Step 6: Ensemble**

Keep ALL strategies that pass (DSR > threshold, PBO < threshold, CPCV pass rate > threshold, survives sensitivity). Weight them by DSR score. The consensus of 15-30 decent strategies is more robust than 1 "best" strategy.

### Key Thresholds from Research

| Rule | Value | Source |
|---|---|---|
| Max strategies to test (~25yr data) | ~300+ independent | MinBTL formula (Bailey & Lopez de Prado) |
| Required t-stat for significance | > 3.0 (not 2.0) | Harvey, Liu & Zhu (2016) |
| Max parameters per strategy | 3-6 | Rob Carver "Systematic Trading" |
| Min Sharpe to trust | > 0.5 | MinBTL at ~25yr (was 0.7 at 16yr) |
| DSR threshold (Robustness A) | > 0.95 | Lopez de Prado |
| PBO threshold (Robustness A) | < 0.15 | Lopez de Prado |
| Min data for Sharpe 1.0 | ~8 years | MinBTL formula |
| Min data for Sharpe 0.5 | ~32 years | MinBTL formula |

### Key Principles from Practitioners

- **Rob Carver:** "The easiest way to avoid overfitting is to do no fitting at all." Use fixed, theory-driven parameters. Each parameter added roughly halves the effective sample size. Average across rule variations rather than picking the best one.
- **Andreas Clenow:** "Trade a concept, not an optimized model." If small parameter changes destroy performance, the strategy is overfit.
- **Ernest Chan:** Fit a time-series model to actual data, generate synthetic paths, optimize on those — sidesteps the finite-data problem.
- **Lopez de Prado:** "In finance, simpler models combined well often outperform complex ones used alone."

### Minimum Backtest Length (MinBTL)

```
MinBTL ≈ (1 + SR²/2) / SR² × (Z_α + Z_β)²
```

| Target Sharpe | Min years needed |
|---|---|
| 0.50 | ~32 years |
| 1.00 | ~8 years |
| 1.50 | ~4 years |
| 2.00 | ~2.5 years |

With ~25 years of data (target: 2000-2026, exact range TBD based on data availability), we can detect Sharpe > 0.5 with confidence. This is a significant improvement over the previous 16-year assumption (SLV inception). Assets with shorter history (SLV from 2006, GLD from 2004) will have shorter backtest windows for strategies that use them — the engine should note this per strategy.

**NOTE:** The exact data start dates, backtest period, and derived thresholds (MinBTL, max testable strategies) should be adjusted once we fetch the actual data and confirm availability per series.

---

## Rating & Robustness Grading System

Every strategy receives two independent grades on an A+ to F scale (0-100 numeric score):

**Grade Scale:** A+ (97-100), A (93-96), A- (90-92), B+ (87-89), B (83-86), B- (80-82), C+ (77-79), C (73-76), C- (70-72), D+ (67-69), D (63-66), D- (60-62), F (0-59)

### Rating (Composite Quality Score)
Composite of risk-adjusted return, consistency, and overall quality. Derived from: CAGR, Sharpe, Max DD, Profit Factor, Trades/yr. Answers: "How good is this strategy's performance?"

### Robustness (Statistical Confidence Score)
Statistical confidence that the strategy is real, not overfit. Derived from: CPCV pass rate, DSR, PBO, sensitivity test pass, rule necessity test pass. Answers: "How confident are we that the performance is genuine?"

### Low Confidence Warning
When no saved strategies score above Robustness C- (70), show a warning banner: "Low confidence — no saved strategy has strong statistical backing. Consider defaulting to cash or running Discovery to find better strategies."

---

## Regime Model (Radar Page Context Widget)

Not a trading signal — a "weather forecast" for markets. Scores current macro data against historical crisis patterns.

### Bear Market Phase Model

Based on patterns from 2000-02, 2007-09, 2020, 2022:

**Phase 0: Late Cycle Excess** — Low VIX (<15), tight credit spreads, yield curve flattening. Duration: 6-18 months before trouble. Gold starting to outperform.

**Phase 1: Warning Signs** — Yield curve inverts, credit spreads start widening, unemployment bottoms and ticks up, VIX creeping above 20. Duration: 3-12 months. Gold and Cash work.

**Phase 2: Acute Crisis** — VIX > 30, credit spreads blow out (>5%), unemployment rising fast, Fed starts emergency cutting. Duration: 1-6 months. Cash is king, gold mixed (can drop in liquidity crunch then recover).

**Phase 3: Bottoming / Early Recovery** — VIX starts declining from peak, Fed aggressively easing, assets deeply oversold (RSI < 30). Duration: 2-6 months. QQQ rebound, Silver catches up.

**Phase 4: Recovery / Expansion** — Unemployment peaks and turns, yield curve steepens, VIX normalizes (<20). Duration: 12-24 months. QQQ and Silver.

The Radar page shows a percentage match for each phase based on how many of its indicators match current conditions, with an indicator-by-indicator checklist (checkmark/X).

---

## Visual Design Spec

| Element | Value |
|---|---|
| Background | `#0D1117` |
| Card background | `#161B22`, 1px border `#30363D`, 8px border radius |
| Primary font | Inter (Google CDN) |
| Monospace numbers | JetBrains Mono (Google CDN) |
| Green (safe/positive) | `#1A7A4A` |
| Amber (elevated/watch) | `#D4801A` |
| Orange (high/warning) | `#C06020` |
| Red (critical/negative) | `#C0392B` |
| Accent blue | `#2C5F82` |
| Freshness: LIVE | Green dot, updated within 24h |
| Freshness: RECENT | Blue dot, updated within 7 days |
| Freshness: LAGGED | Amber half-dot, 1 week to 6 weeks |
| Freshness: STALE | Red dot, older than 6 weeks |
| Tooltips | `#1E2A38` bg, white text, 14px Inter, max-width 320px, 8px radius, 150ms fade-in |
| No charts for now | Tables and text only |
| Mobile responsive | Must work on phone |
| Animations | Respect `prefers-reduced-motion` |

### Design patterns to adopt:
- Indicator cards with gradient range bars (green→red) showing current position
- Traffic light badges (SAFE/ELEVATED/HIGH/CRITICAL)
- Plain-English narrative explanations under each section
- Collapsible "How to read this" panels
- Freshness badges on every data point
- Tooltip system with circled-i icons for non-expert users
- Recent Events / Signal Change box (appears only when something changed)
- Divergence detection (when strategies disagree with regime assessment)

---

## App Pages (4 tabs + password)

### Password Page
Simple full-screen input. Single shared password. Dark background. Centered input field.

### Tab 1: Radar (Home)
- **Data Health Bar** — compact bar at the top showing data freshness per source (EODHD, FRED), warnings for lagged/stale series
- **Consensus Recommendation** — "Current Position" (what we're invested in now based on the top-rated saved strategy) and "Weighted Consensus" (allocation across saved strategies weighted by Rating score — each strategy votes for an asset with vote weight = its Rating score, displayed as a weighted allocation bar). Example: if 2 strategies (Rating 97, 91) say GLD and 1 (Rating 95) says Cash, GLD gets (97+91)/(97+91+95) = 66%, Cash gets 34%.
- **"Why X Now"** — plain-English dominant drivers and offsetting factors with actual indicator values
- **Signal Change Alert** — only appears when a signal transition is imminent (happening tomorrow) or in progress (transitioning from asset A to B). Does not show historical signal changes.
- **Regime Assessment** — phase model with percentage match and indicator checklist. The Regime Assessment model uses a subset of the indicators to score phase matches. Individual indicator changes that affect the regime score trigger Indicator Alerts on the Radar page.
- **Strategy Agreement** — table showing each strategy's signal, Rating, and whether it agrees with consensus. Weighted agreement percentage (what % of total Rating weight agrees with the consensus). Divergence warnings (highlight strategies that disagree with the majority, especially if they have high Rating).
- **Indicator Alerts** — important changes in key indicators shown as alert cards that link to the Indicators page. Only appears when an indicator has changed direction or crossed a significant threshold recently. If no alerts, this section is hidden.
- **"How to Read This Dashboard"** — collapsible panel explaining methodology

### Tab 2: Discovery
- **Strategy generation engine** — configuration panel (rules per strategy slider 3-6, max strategies dropdown, min Rating/Robustness grade dropdowns, CPCV/DSR/PBO threshold displays) + "Run Discovery" button. Only active in local mode; on Vercel shows "Discovery requires local mode" with setup instructions.
- **Run controls** — progress bar showing: current phase, percentage, strategies generated/passed at each filter stage, elapsed time, estimated remaining. Pause/Stop controls.
- **Strategy Pool table** — browsable table of all generated strategies (~100+). Columns: Name, Signal, Rating (grade + score), Robustness (grade + score), CAGR, Sharpe, Max DD, Profit Factor, Trades/yr.
- **Filter by:** Signal, Min Rating, Min Sharpe, Max Drawdown, Saved only
- **Heart icon** on each row to save/unsave strategies to favorites (saved strategies appear on the Strategies tab and contribute to Radar consensus)
- **Click to expand:** full detail view with signal badge, KPIs with per-KPI grades, assessment, collapsible Strategy Rules section, collapsible Robustness Check section (CPCV/DSR/PBO details), collapsible Trade Log, collapsible Live Track Record (if saved)

### Tab 3: Strategies (Saved Only)
- Shows ONLY saved/favorited strategies from the Discovery pool. These are the strategies that contribute to the Radar consensus.
- List of saved strategies sorted by Rating
- Each strategy card shows: rules in plain English with current indicator values and ACTIVE/NOT ACTIVE status, KPIs (CAGR, MaxDD, Sharpe, Profit Factor, trades/yr), Rating (grade + score), Robustness (grade + score)
- Expandable period breakdown table
- Expandable rule activation details
- Expandable Live Track Record (shows live performance since save date, trust progression label, return vs each asset)
- Expandable "Why this strategy works" plain-English explanation
- Sort/filter controls
- Heart icon to unsave (removes from Strategies tab, returns to Discovery pool only)

### Tab 4: Indicators
- **Macro section (FRED):** All 23 indicators as full cards grouped by category (Rates & Yield Curve, Credit & Financial Conditions, Labor Market, Inflation, Volatility, Liquidity). Each card shows:
  - Title (plain English) + FRED series ID in small text
  - Current value (prominent, monospace)
  - **Two signal rows, stacked for quick scanning:**
    - **Value signal:** BULLISH / BEARISH / NEUTRAL — what the current value means for risk assets, with brief explanation
    - **Trend signal:** BULLISH / BEARISH / NEUTRAL — what the direction of change means, with magnitude and timeframe
  - Gradient range bar with marker showing current position in historical range
  - Status badge (Safe/Watch/Elevated/Critical)
  - Freshness badge (Live/Recent/Lagged/Stale)
  - The goal is to quickly scan which indicators are pointing to a downturn (red/bearish) vs which are positive (green/bullish) or uninformative (gray/neutral)
- **Technical section (EODHD):** Table per asset showing RSI, vs SMA200, 12-month return, drawdown from 52-week high
- **Cross-asset section:** Gold/Silver ratio, Copper/Gold ratio, DXY level

---

## Lessons from Prior App (Gold-or-Tech)

### Keep
- EODHD symbol verification (GLD.US, SLV.US, QQQ.US — not GC.COMEX)
- Off-by-one fix: fetch from `last_date + 1`
- Data validation: check for gaps (missing weekdays), alert before committing
- "No update in 48hrs" warning for silent pipeline failures
- Execution realism: signal at t-1 drives allocation at t, minimum hold period, transaction costs
- Full strategy serialization: all parameters stored explicitly, no implicit defaults, deterministic replay guaranteed

### Don't Keep
- Genetic algorithm / random generation approach → replaced by hypothesis-driven rules
- Multi-tier data fallbacks (Yahoo, Stooq) → EODHD and FRED only, show errors on failure
- Monolithic 9,700-line index.html → Next.js with proper routing
- Web Workers for GA computation → Python engine for discovery
- IndexedDB for persistence → Vercel Postgres
- 6-day transit through Cash for switches → 1-day execution delay + 10-day minimum hold
- 42-day minimum hold → 10-day minimum hold

---

## Current State of Code
- **Repo:** graniteam42-create/exodus, branch claude/trading-strategy-app-ZTjSa
- **Contents:** Empty — old prototype files were deleted and pushed (commit b1579e0)
- **No functional code exists** — only planning/PRD work done

---

## What's Next
1. Commit this PRD as a markdown file in the repo
2. Create HTML mockup — static, surfable in browser, with mock data. Purpose: iterate on structure and design before coding the real app. Should include all 4 pages + password page with the visual design spec applied.
3. Iterate on mockup with user feedback until layout/structure is approved
4. Build the actual Next.js app with Python discovery engine
5. Set up Vercel Postgres schema for strategies and cached data
6. Implement data pipeline (EODHD + FRED fetching and caching)
7. Implement strategy engine (rule evaluation, CPCV, DSR, PBO)
8. Deploy to Vercel
