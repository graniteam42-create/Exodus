from pydantic import BaseModel
from typing import Optional


class OHLCVRow(BaseModel):
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: int


class StrategyParam(BaseModel):
    name: str
    label: str
    type: str  # "int" or "float"
    default: float
    min: float
    max: float
    step: float


class StrategyInfo(BaseModel):
    name: str
    display_name: str
    description: str
    params: list[StrategyParam]


class BacktestRequest(BaseModel):
    strategy: str
    params: dict
    ticker: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    initial_capital: float = 100000.0


class TradeRecord(BaseModel):
    entry_date: str
    exit_date: str
    entry_price: float
    exit_price: float
    shares: float
    pnl: float
    return_pct: float
    side: str  # "LONG"


class BacktestResult(BaseModel):
    total_return: float
    annualized_return: float
    sharpe_ratio: float
    max_drawdown: float
    win_rate: float
    total_trades: int
    equity_curve: list[dict]
    trades: list[TradeRecord]
    signals: list[dict]
    indicator_data: dict  # strategy-specific indicator series for charting


class TradeRequest(BaseModel):
    ticker: str
    side: str  # "buy" or "sell"
    quantity: float


class PortfolioState(BaseModel):
    cash: float
    holdings: dict
    total_value: float
    history: list[dict]
