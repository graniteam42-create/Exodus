from fastapi import APIRouter
from backend.strategies import STRATEGY_REGISTRY

router = APIRouter(prefix="/api/strategies", tags=["strategies"])


@router.get("")
def list_strategies():
    result = []
    for key, strategy in STRATEGY_REGISTRY.items():
        result.append({
            "name": key,
            "display_name": strategy.display_name,
            "description": strategy.description,
            "params": strategy.default_params(),
        })
    return result


@router.get("/{name}")
def get_strategy(name: str):
    strategy = STRATEGY_REGISTRY.get(name)
    if not strategy:
        return {"error": "Strategy not found"}
    return {
        "name": name,
        "display_name": strategy.display_name,
        "description": strategy.description,
        "params": strategy.default_params(),
    }
