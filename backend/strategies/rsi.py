import pandas as pd
import numpy as np
from backend.strategies.base import Strategy


class RSIStrategy(Strategy):
    name = "rsi"
    display_name = "RSI (Relative Strength Index)"
    description = "Buys when RSI drops below oversold level, sells when RSI rises above overbought level."

    def default_params(self) -> list[dict]:
        return [
            {"name": "period", "label": "RSI Period", "type": "int", "default": 14, "min": 5, "max": 50, "step": 1},
            {"name": "overbought", "label": "Overbought Level", "type": "int", "default": 70, "min": 60, "max": 90, "step": 5},
            {"name": "oversold", "label": "Oversold Level", "type": "int", "default": 30, "min": 10, "max": 40, "step": 5},
        ]

    def generate_signals(self, df: pd.DataFrame, params: dict) -> tuple[pd.DataFrame, dict]:
        period = int(params.get("period", 14))
        overbought = float(params.get("overbought", 70))
        oversold = float(params.get("oversold", 30))

        df = df.copy()
        delta = df["close"].diff()
        gain = delta.where(delta > 0, 0.0)
        loss = (-delta).where(delta < 0, 0.0)

        avg_gain = gain.rolling(window=period).mean()
        avg_loss = loss.rolling(window=period).mean()

        rs = avg_gain / avg_loss.replace(0, np.nan)
        df["rsi"] = 100 - (100 / (1 + rs))

        df["signal"] = 0
        # Buy when RSI crosses below oversold
        prev_rsi = df["rsi"].shift(1)
        df.loc[(prev_rsi >= oversold) & (df["rsi"] < oversold), "signal"] = 1
        # Sell when RSI crosses above overbought
        df.loc[(prev_rsi <= overbought) & (df["rsi"] > overbought), "signal"] = -1

        indicator_data = {
            "oscillator": {
                "name": "RSI",
                "data": [{"date": r["date"], "value": round(r["rsi"], 2)} for _, r in df.iterrows() if not np.isnan(r["rsi"])],
                "levels": [
                    {"value": overbought, "label": "Overbought"},
                    {"value": oversold, "label": "Oversold"},
                ],
            }
        }
        return df, indicator_data
