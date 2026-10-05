from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.engines.ai_autopilot import autopilot_engine

router = APIRouter(tags=["AI Autopilot"])


class AutopilotStartRequest(BaseModel):
    target_profit: float = Field(default=1000.0, gt=0, description="Target profit in USD (e.g. 1000.0)")
    max_loss: float = Field(default=200.0, gt=0, description="Maximum drawdown/loss in USD before safety stop")
    volume: float = Field(default=0.01, gt=0, le=5.0, description="Lot size per trade")
    symbol: str = Field(default="XAUUSDm", min_length=2, max_length=20)
    interval: str = Field(default="1h", min_length=2, max_length=10)


class AutopilotStopRequest(BaseModel):
    close_positions: bool = Field(default=True, description="Whether to close currently open positions")


@router.get("/autopilot/status")
def get_autopilot_status():
    """Retrieve current state, target progress, profit, and live logs of the AI Autopilot."""
    return autopilot_engine.get_status()


@router.post("/autopilot/start")
def start_autopilot(payload: AutopilotStartRequest):
    """Start the autonomous AI trading agent with user-defined target profit."""
    try:
        status = autopilot_engine.start(
            target_profit=payload.target_profit,
            max_loss=payload.max_loss,
            volume=payload.volume,
            symbol=payload.symbol,
            interval=payload.interval,
        )
        return {"success": True, "message": f"AI Autopilot berhasil dimulai menuju target ${payload.target_profit:,.2f}", "data": status}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/autopilot/pause")
def pause_autopilot():
    """Pause the AI Autopilot."""
    status = autopilot_engine.pause()
    return {"success": True, "message": "AI Autopilot dijeda", "data": status}


@router.post("/autopilot/stop")
def stop_autopilot(payload: Optional[AutopilotStopRequest] = None):
    """Stop the AI Autopilot and optionally close positions."""
    close_positions = payload.close_positions if payload else True
    status = autopilot_engine.stop(close_positions=close_positions)
    return {"success": True, "message": "AI Autopilot dihentikan", "data": status}


@router.post("/autopilot/step")
def trigger_autopilot_step():
    """Manually trigger one evaluation cycle for testing or immediate check."""
    status = autopilot_engine.evaluate_cycle()
    return {"success": True, "data": status}
