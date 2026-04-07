import pandas as pd
import numpy as np
from backend.strategies.base import Strategy


class BollingerBands(Strategy):
    name = "bollinger_bands"
    display_name = "Bollinger Bands"
    description = "Mean reversion strategy: buys when price touches lower band, sells when price touches upper band."

    def default_params(self) -> list[dict]:
        return [
            {"name": "period", "label": "Period", "type": "int", "default": 20, "min": 10, "max": 50, "step": 1},
            {"name": "num_std", "label": "Std Deviations", "type": "float", "default": 2.0, "min": 1.0, "max": 3.0, "step": 0.1},
        ]

    def generate_signals(self, df: pd.DataFrame, params: dict) -> tuple[pd.DataFrame, dict]:
        period = int(params.get("period", 20))
        num_std = float(params.get("num_std", 2.0))

        df = df.copy()
        df["bb_middle"] = df["close"].rolling(window=period).mean()
        rolling_std = df["close"].rolling(window=period).std()
        df["bb_upper"] = df["bb_middle"] + num_std * rolling_std
        df["bb_lower"] = df["bb_middle"] - num_std * rolling_std

        df["signal"] = 0
        df.loc[df["close"] <= df["bb_lower"], "signal"] = 1
        df.loc[df["close"] >= df["bb_upper"], "signal"] = -1

        indicator_data = {
            "bands": [
                {"name": "Upper Band", "data": [{"date": r["date"], "value": round(r["bb_upper"], 2)} for _, r in df.iterrows() if not np.isnan(r["bb_upper"])]},
                {"name": "Middle Band", "data": [{"date": r["date"], "value": round(r["bb_middle"], 2)} for _, r in df.iterrows() if not np.isnan(r["bb_middle"])]},
                {"name": "Lower Band", "data": [{"date": r["date"], "value": round(r["bb_lower"], 2)} for _, r in df.iterrows() if not np.isnan(r["bb_lower"])]},
            ]
        }
        return df, indicator_data
