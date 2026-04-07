import pandas as pd
import numpy as np
from backend.strategies.base import Strategy


class MovingAverageCrossover(Strategy):
    name = "moving_average"
    display_name = "Moving Average Crossover"
    description = "Generates buy signals when fast SMA crosses above slow SMA, and sell signals on the reverse."

    def default_params(self) -> list[dict]:
        return [
            {"name": "fast_period", "label": "Fast Period", "type": "int", "default": 10, "min": 5, "max": 50, "step": 1},
            {"name": "slow_period", "label": "Slow Period", "type": "int", "default": 30, "min": 20, "max": 200, "step": 5},
        ]

    def generate_signals(self, df: pd.DataFrame, params: dict) -> tuple[pd.DataFrame, dict]:
        fast = int(params.get("fast_period", 10))
        slow = int(params.get("slow_period", 30))

        df = df.copy()
        df["sma_fast"] = df["close"].rolling(window=fast).mean()
        df["sma_slow"] = df["close"].rolling(window=slow).mean()

        df["signal"] = 0
        df.loc[df["sma_fast"] > df["sma_slow"], "signal"] = 1
        df.loc[df["sma_fast"] <= df["sma_slow"], "signal"] = -1

        # Only keep crossover points as actual signals
        df["signal"] = df["signal"].diff().fillna(0)
        df.loc[df["signal"] > 0, "signal"] = 1
        df.loc[df["signal"] < 0, "signal"] = -1
        df.loc[~df["signal"].isin([1, -1]), "signal"] = 0

        indicator_data = {
            "lines": [
                {"name": f"SMA {fast}", "data": [{"date": r["date"], "value": round(r["sma_fast"], 2)} for _, r in df.iterrows() if not np.isnan(r["sma_fast"])]},
                {"name": f"SMA {slow}", "data": [{"date": r["date"], "value": round(r["sma_slow"], 2)} for _, r in df.iterrows() if not np.isnan(r["sma_slow"])]},
            ]
        }
        return df, indicator_data
