import logging
from fastapi import FastAPI, Request
from fastapi.concurrency import asynccontextmanager
from fastapi.responses import JSONResponse

from backend.config import validate_config
from backend.database.connection import init_database


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting AI Banking Data Assistant...")
    validate_config()           
    init_database()             
    logger.info("Startup complete. API is ready.")
    yield
    logger.info("Shutting down AI Banking Data Assistant.")

app = FastAPI(
    title="AI Banking Data Assistant",
    description="Natural language interface for banking data — powered by SQLCoder",
    version="1.0.0",
    lifespan=lifespan
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error on {request.url}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"error": "An internal server error occurred. Please try again."}
    )
    
    
@app.get("/")
async def root():
    return {"message": "AI Banking Data Assistant", "status": "running", "docs": "/docs"}
