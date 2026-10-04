from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, AwareDatetime, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)


class ItemInput(StrictModel):
    name: str = Field(min_length=1, max_length=100)
    spec: dict


class ImportSource(StrictModel):
    name: str = Field(min_length=1, max_length=100)
    source: str = Field(min_length=1, max_length=150000)
    author: str = Field(min_length=1, max_length=100)
    license: str = Field(min_length=1, max_length=100)
    source_url: str = Field(default='', max_length=500)
    adaptation: Literal['source_only', 'boswaves_numeric'] = 'source_only'


class DatasetInput(StrictModel):
    name: str = Field(min_length=1, max_length=100)
    broker: str = Field(min_length=1, max_length=100)
    server: str = Field(min_length=1, max_length=100)
    symbol: str = Field(pattern=r'^[A-Za-z0-9_.-]{1,30}$')
    interval: Literal['1m', '5m', '15m', '1h', '4h', '1d'] = '1m'
    csv: str = Field(min_length=1, max_length=25000000)
    timezone: Literal['UTC'] = 'UTC'
    role: Literal['research', 'holdout'] = 'research'


class HistoryRequest(StrictModel):
    name: str = Field(min_length=1, max_length=100)
    symbol: str = Field(default='XAUUSDm', pattern=r'^[A-Za-z0-9_.-]{1,30}$')
    start: AwareDatetime
    end: AwareDatetime

    @model_validator(mode='after')
    def range_valid(self):
        if not 0 < (self.end-self.start).total_seconds() <= 100*86400:
            raise ValueError('Rentang sinkronisasi maksimal 100 hari, akhir harus setelah awal.')
        return self


class IndicatorInstance(StrictModel):
    alias: str = Field(pattern=r'^[a-z][a-z0-9_]{0,29}$')
    version_id: str
    params: dict = Field(default_factory=dict)


class StrategyConfig(StrictModel):
    description: str = Field(default='', max_length=1000)
    indicators: list[IndicatorInstance] = Field(min_length=1, max_length=32)
    buy: dict
    sell: dict
    stop: dict
    target_r: float = Field(default=2, gt=0, le=20)
    status: Literal['idea'] = 'idea'
    assumptions: str = Field(min_length=1, max_length=2000)


class Costs(StrictModel):
    spread: float = Field(ge=0, le=10000, description='Bid/ask price distance')
    slippage: float = Field(ge=0, le=10000, description='Adverse price distance per fill')
    commission_per_lot: float = Field(ge=0, le=10000, description='Round trip commission')
    contract_size: float = Field(gt=0, le=1000000)
    volume_min: float = Field(gt=0, le=100)
    volume_step: float = Field(gt=0, le=100)
    volume_max: float = Field(gt=0, le=10000)

    @model_validator(mode='after')
    def volumes(self):
        if self.volume_max < self.volume_min:
            raise ValueError('volume_max harus >= volume_min')
        return self


class RunInput(StrictModel):
    name: str = Field(min_length=1, max_length=100)
    strategy_version_id: str
    dataset_version_id: str
    initial_balance: float = Field(gt=0, le=1e9)
    risk_percent: float = Field(gt=0, le=10)
    target_trades: int = Field(default=100, ge=1, le=10000)
    costs: Costs
    seed: int = Field(default=0, ge=0, le=2147483647)
    research_ack: bool = False
    unlock_holdout: bool = False


class PreviewInput(StrictModel):
    dataset_version_id: str
    indicators: list[IndicatorInstance] = Field(min_length=1, max_length=32)
