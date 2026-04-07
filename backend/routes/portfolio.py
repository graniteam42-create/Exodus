from fastapi import APIRouter
from backend.models import TradeRequest
from backend.engine.portfolio import portfolio
from backend.data.mock_data import get_latest_prices

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


@router.get("")
def get_portfolio():
    return portfolio.get_state()


@router.post("/trade")
def execute_trade(req: TradeRequest):
    prices = get_latest_prices()
    ticker = req.ticker.upper()
    price = prices.get(ticker)
    if price is None:
        return {"error": f"Unknown ticker: {ticker}"}

    if req.side.lower() == "buy":
        return portfolio.buy(ticker, req.quantity, price)
    elif req.side.lower() == "sell":
        return portfolio.sell(ticker, req.quantity, price)
    else:
        return {"error": "Side must be 'buy' or 'sell'"}


@router.get("/history")
def get_history():
    return portfolio.history
