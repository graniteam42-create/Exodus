from fastapi import APIRouter
from backend.data.mock_data import get_all_tickers, get_data

router = APIRouter(prefix="/api/data", tags=["data"])


@router.get("/tickers")
def list_tickers():
    return get_all_tickers()


@router.get("/{ticker}/ohlcv")
def get_ohlcv(ticker: str, start: str = None, end: str = None):
    ticker = ticker.upper()
    df = get_data(ticker)
    if start:
        df = df[df["date"] >= start]
    if end:
        df = df[df["date"] <= end]
    return df.to_dict(orient="records")
