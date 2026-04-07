from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

from backend.routes import data, strategies, backtest, portfolio

app = FastAPI(title="Exodus Trading Strategy Platform", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(data.router)
app.include_router(strategies.router)
app.include_router(backtest.router)
app.include_router(portfolio.router)

frontend_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
app.mount("/static", StaticFiles(directory=os.path.join(frontend_dir, "static")), name="static")


@app.get("/")
def serve_index():
    return FileResponse(os.path.join(frontend_dir, "index.html"))
