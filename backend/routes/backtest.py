from fastapi import APIRouter
from backend.models import BacktestRequest
from backend.strategies import STRATEGY_REGISTRY
from backend.data.mock_data import get_data
from backend.engine.backtester import run_backtest

router = APIRouter(prefix="/api", tags=["backtest"])


@router.post("/backtest")
def backtest(req: BacktestRequest):
    strategy = STRATEGY_REGISTRY.get(req.strategy)
    if not strategy:
        return {"error": f"Unknown strategy: {req.strategy}"}

    df = get_data(req.ticker.upper())
    if req.start_date:
        df = df[df["date"] >= req.start_date]
    if req.end_date:
        df = df[df["date"] <= req.end_date]

    df = df.reset_index(drop=True)
    df, indicator_data = strategy.generate_signals(df, req.params)
    result = run_backtest(df, initial_capital=req.initial_capital)
    result.indicator_data = indicator_data
    return result
