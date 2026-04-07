import pandas as pd
import numpy as np
from backend.strategies.base import Strategy


class MACDStrategy(Strategy):
    name = "macd"
    display_name = "MACD"
    description = "Generates signals based on MACD line crossing above/below the signal line."

    def default_params(self) -> list[dict]:
        return [
            {"name": "fast_period", "label": "Fast EMA Period", "type": "int", "default": 12, "min": 5, "max": 30, "step": 1},
            {"name": "slow_period", "label": "Slow EMA Period", "type": "int", "default": 26, "min": 15, "max": 50, "step": 1},
            {"name": "signal_period", "label": "Signal Period", "type": "int", "default": 9, "min": 5, "max": 20, "step": 1},
        ]

    def generate_signals(self, df: pd.DataFrame, params: dict) -> tuple[pd.DataFrame, dict]:
        fast = int(params.get("fast_period", 12))
        slow = int(params.get("slow_period", 26))
        signal_period = int(params.get("signal_period", 9))

        df = df.copy()
        df["ema_fast"] = df["close"].ewm(span=fast, adjust=False).mean()
        df["ema_slow"] = df["close"].ewm(span=slow, adjust=False).mean()
        df["macd_line"] = df["ema_fast"] - df["ema_slow"]
        df["macd_signal"] = df["macd_line"].ewm(span=signal_period, adjust=False).mean()
        df["macd_histogram"] = df["macd_line"] - df["macd_signal"]

        df["signal"] = 0
        prev_macd = df["macd_line"].shift(1)
        prev_signal = df["macd_signal"].shift(1)

        # Buy when MACD crosses above signal line
        df.loc[(prev_macd <= prev_signal) & (df["macd_line"] > df["macd_signal"]), "signal"] = 1
        # Sell when MACD crosses below signal line
        df.loc[(prev_macd >= prev_signal) & (df["macd_line"] < df["macd_signal"]), "signal"] = -1

        indicator_data = {
            "macd": {
                "macd_line": [{"date": r["date"], "value": round(r["macd_line"], 4)} for _, r in df.iterrows() if not np.isnan(r["macd_line"])],
                "signal_line": [{"date": r["date"], "value": round(r["macd_signal"], 4)} for _, r in df.iterrows() if not np.isnan(r["macd_signal"])],
                "histogram": [{"date": r["date"], "value": round(r["macd_histogram"], 4)} for _, r in df.iterrows() if not np.isnan(r["macd_histogram"])],
            }
        }
        return df, indicator_data
