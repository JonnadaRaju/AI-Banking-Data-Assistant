import logging
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from backend.models.schemas import QueryRequest, QueryResponse
from backend.services.nlp_service import query_to_sql
from backend.database.connection import check_connection
from backend.services.validator import validate_sql
from backend.services.db_service import execute_query


logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/query", response_model=QueryResponse)
async def handle_query(request: QueryRequest) -> QueryResponse:
    logger.info(f"Received query: {request.user_query}")

    try:
        sql = query_to_sql(request.user_query)
    except Exception as e:
        logger.error(f"NLP service error: {e}")
        return QueryResponse(error=str(e))

    is_valid, error_message = validate_sql(sql)
    if not is_valid:
        logger.warning(f"SQL validation blocked: {sql}")
        return QueryResponse(sql=sql, error=error_message)

    try:
        columns, rows, chart_data = execute_query(sql)
    except Exception as e:
        logger.error(f"Database execution error: {e}")
        return QueryResponse(sql=sql, error=str(e))

    logger.info(f"Query successful: {len(rows)} rows returned")
    return QueryResponse(
        sql=sql,
        columns=columns,
        rows=rows,
        row_count=len(rows),
        chart_data=chart_data,
        error=None
    )


@router.get("/health")
async def health_check():
    db_ok = check_connection()
    return JSONResponse(content={
        "status": "healthy" if db_ok else "degraded",
        "database": "connected" if db_ok else "unreachable",
        "api": "running"
    })