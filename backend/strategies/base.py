from abc import ABC, abstractmethod
import pandas as pd


class Strategy(ABC):
    name: str
    display_name: str
    description: str

    @abstractmethod
    def default_params(self) -> list[dict]:
        """Return list of parameter definitions."""
        ...

    @abstractmethod
    def generate_signals(self, df: pd.DataFrame, params: dict) -> tuple[pd.DataFrame, dict]:
        """
        Add 'signal' column to df: 1 (buy), -1 (sell), 0 (hold).
        Returns (df_with_signals, indicator_data_for_charting).
        """
        ...
