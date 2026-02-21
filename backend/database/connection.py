
from typing import Any, Optional
from pydantic import BaseModel, field_validator


class QueryRequest(BaseModel):
    user_query: str

    @field_validator("user_query")
    @classmethod
    def query_must_not_be_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("user_query cannot be empty.")
        if len(v) > 500:
            raise ValueError("user_query cannot exceed 500 characters.")
        return v


class ChartData(BaseModel):
    type: str          
    labels: list[str]
    values: list[float]


class QueryResponse(BaseModel):
    sql: Optional[str] = None
    columns: list[str] = []
    rows: list[list[Any]] = []
    row_count: int = 0
    chart_data: Optional[ChartData] = None
    error: Optional[str] = None