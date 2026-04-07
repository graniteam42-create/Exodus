from backend.data.mock_data import get_latest_prices


class Portfolio:
    def __init__(self, initial_capital: float = 100000.0):
        self.cash = initial_capital
        self.holdings: dict[str, dict] = {}  # {ticker: {qty, avg_price}}
        self.history: list[dict] = []
        self._record_snapshot()

    def _record_snapshot(self):
        prices = get_latest_prices()
        total = self.cash + sum(
            h["qty"] * prices.get(t, 0) for t, h in self.holdings.items()
        )
        self.history.append({"value": round(total, 2)})

    def buy(self, ticker: str, qty: float, price: float) -> dict:
        cost = qty * price
        if cost > self.cash:
            return {"error": "Insufficient funds"}
        self.cash -= cost
        if ticker in self.holdings:
            existing = self.holdings[ticker]
            total_qty = existing["qty"] + qty
            avg = (existing["qty"] * existing["avg_price"] + qty * price) / total_qty
            self.holdings[ticker] = {"qty": total_qty, "avg_price": round(avg, 2)}
        else:
            self.holdings[ticker] = {"qty": qty, "avg_price": round(price, 2)}
        self._record_snapshot()
        return {"status": "ok", "filled_qty": qty, "filled_price": price}

    def sell(self, ticker: str, qty: float, price: float) -> dict:
        if ticker not in self.holdings or self.holdings[ticker]["qty"] < qty:
            return {"error": "Insufficient shares"}
        self.holdings[ticker]["qty"] -= qty
        if self.holdings[ticker]["qty"] <= 0:
            del self.holdings[ticker]
        self.cash += qty * price
        self._record_snapshot()
        return {"status": "ok", "filled_qty": qty, "filled_price": price}

    def get_state(self) -> dict:
        prices = get_latest_prices()
        holdings_value = sum(
            h["qty"] * prices.get(t, 0) for t, h in self.holdings.items()
        )
        holdings_detail = {}
        for t, h in self.holdings.items():
            current_price = prices.get(t, 0)
            market_value = h["qty"] * current_price
            pnl = (current_price - h["avg_price"]) * h["qty"]
            holdings_detail[t] = {
                "qty": h["qty"],
                "avg_price": h["avg_price"],
                "current_price": round(current_price, 2),
                "market_value": round(market_value, 2),
                "pnl": round(pnl, 2),
            }
        return {
            "cash": round(self.cash, 2),
            "holdings": holdings_detail,
            "total_value": round(self.cash + holdings_value, 2),
            "history": self.history,
        }


portfolio = Portfolio()
