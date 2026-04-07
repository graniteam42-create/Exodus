from backend.strategies.moving_average import MovingAverageCrossover
from backend.strategies.rsi import RSIStrategy
from backend.strategies.bollinger import BollingerBands
from backend.strategies.macd import MACDStrategy

STRATEGY_REGISTRY = {
    "moving_average": MovingAverageCrossover(),
    "rsi": RSIStrategy(),
    "bollinger_bands": BollingerBands(),
    "macd": MACDStrategy(),
}
