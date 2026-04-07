import pandas as pd
import numpy as np
from backend.models import BacktestResult, TradeRecord


def run_backtest(
    df: pd.DataFrame,
    initial_capital: float = 100000.0,
    commission: float = 0.001,
) -> BacktestResult:
    capital = initial_capital
    shares = 0.0
    position_open = False
    entry_price = 0.0
    entry_date = ""
    trades = []
    equity_curve = []

    for _, row in df.iterrows():
        date = row["date"]
        price = row["close"]
        signal = row.get("signal", 0)

        if signal == 1 and not position_open:
            # Buy
            cost = capital * commission
            invest = capital - cost
            shares = invest / price
            entry_price = price
            entry_date = date
            capital = 0.0
            position_open = True

        elif signal == -1 and position_open:
            # Sell
            proceeds = shares * price
            cost = proceeds * commission
            capital = proceeds - cost
            pnl = capital - (shares * entry_price)
            return_pct = (price - entry_price) / entry_price * 100

            trades.append(TradeRecord(
                entry_date=entry_date,
                exit_date=date,
                entry_price=round(entry_price, 2),
                exit_price=round(price, 2),
                shares=round(shares, 4),
                pnl=round(pnl, 2),
                return_pct=round(return_pct, 2),
                side="LONG",
            ))
            shares = 0.0
            position_open = False

        # Track equity
        current_value = capital + shares * price
        equity_curve.append({"date": date, "value": round(current_value, 2)})

    # Compute metrics
    equity_values = [e["value"] for e in equity_curve]
    if len(equity_values) < 2:
        return BacktestResult(
            total_return=0, annualized_return=0, sharpe_ratio=0,
            max_drawdown=0, win_rate=0, total_trades=0,
            equity_curve=equity_curve, trades=trades, signals=[], indicator_data={},
        )

    total_return = (equity_values[-1] - initial_capital) / initial_capital * 100

    # Annualized return
    n_days = len(equity_values)
    annualized_return = ((equity_values[-1] / initial_capital) ** (252 / max(n_days, 1)) - 1) * 100

    # Sharpe ratio
    daily_returns = np.diff(equity_values) / np.array(equity_values[:-1])
    if len(daily_returns) > 1 and np.std(daily_returns) > 0:
        sharpe_ratio = (np.mean(daily_returns) / np.std(daily_returns)) * np.sqrt(252)
    else:
        sharpe_ratio = 0.0

    # Max drawdown
    peak = equity_values[0]
    max_dd = 0.0
    for v in equity_values:
        if v > peak:
            peak = v
        dd = (peak - v) / peak * 100
        if dd > max_dd:
            max_dd = dd

    # Win rate
    winning = sum(1 for t in trades if t.pnl > 0)
    win_rate = (winning / len(trades) * 100) if trades else 0.0

    # Build signal list for charting
    signals = []
    for _, row in df.iterrows():
        if row.get("signal", 0) != 0:
            signals.append({
                "date": row["date"],
                "action": "BUY" if row["signal"] == 1 else "SELL",
                "price": round(row["close"], 2),
            })

    return BacktestResult(
        total_return=round(total_return, 2),
        annualized_return=round(annualized_return, 2),
        sharpe_ratio=round(sharpe_ratio, 2),
        max_drawdown=round(max_dd, 2),
        win_rate=round(win_rate, 1),
        total_trades=len(trades),
        equity_curve=equity_curve,
        trades=trades,
        signals=signals,
        indicator_data={},
    )
