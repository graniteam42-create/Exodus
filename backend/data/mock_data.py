import numpy as np
import pandas as pd
from datetime import datetime, timedelta

TICKERS = ["AAPL", "GOOGL", "MSFT", "TSLA", "AMZN"]

TICKER_SEEDS = {
    "AAPL": 42,
    "GOOGL": 123,
    "MSFT": 456,
    "TSLA": 789,
    "AMZN": 101,
}

TICKER_BASE_PRICES = {
    "AAPL": 150.0,
    "GOOGL": 140.0,
    "MSFT": 330.0,
    "TSLA": 250.0,
    "AMZN": 145.0,
}


def generate_ohlcv(ticker: str, days: int = 500) -> pd.DataFrame:
    seed = TICKER_SEEDS[ticker]
    rng = np.random.default_rng(seed)
    base_price = TICKER_BASE_PRICES[ticker]

    end_date = datetime(2026, 4, 1)
    dates = []
    current = end_date - timedelta(days=int(days * 1.5))
    while len(dates) < days:
        if current.weekday() < 5:  # skip weekends
            dates.append(current)
        current += timedelta(days=1)

    daily_returns = rng.normal(0.0003, 0.018, days)
    prices = np.zeros(days)
    prices[0] = base_price

    for i in range(1, days):
        prices[i] = prices[i - 1] * (1 + daily_returns[i])
        prices[i] = max(prices[i], 1.0)

    opens = prices * (1 + rng.normal(0, 0.003, days))
    highs = np.maximum(prices, opens) * (1 + np.abs(rng.normal(0, 0.008, days)))
    lows = np.minimum(prices, opens) * (1 - np.abs(rng.normal(0, 0.008, days)))
    volumes = (rng.lognormal(17, 0.5, days)).astype(int)

    df = pd.DataFrame({
        "date": [d.strftime("%Y-%m-%d") for d in dates],
        "open": np.round(opens, 2),
        "high": np.round(highs, 2),
        "low": np.round(lows, 2),
        "close": np.round(prices, 2),
        "volume": volumes,
    })
    return df


_cache: dict[str, pd.DataFrame] = {}


def get_data(ticker: str) -> pd.DataFrame:
    if ticker not in _cache:
        _cache[ticker] = generate_ohlcv(ticker)
    return _cache[ticker]


def get_all_tickers() -> list[str]:
    return TICKERS


def get_latest_prices() -> dict[str, float]:
    return {t: float(get_data(t)["close"].iloc[-1]) for t in TICKERS}
