import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from backend.config import validate_config
from backend.database.connection import init_database
from backend.routes.query import router as query_router



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
    description="Natural language interface for banking data — powered by OpenAI",
    version="1.0.0",
    lifespan=lifespan
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost",
        "http://localhost:3000",
        "http://localhost:7000",
        "http://127.0.0.1",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:7000",
        "null",
        "https://ai-banking-frontend.onrender.com"
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)



@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error on {request.url}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"error": "An internal server error occurred. Please try again."}
    )
    
    
app.include_router(query_router)

@app.get("/")
async def root():
    return {"message": "AI Banking Data Assistant", "status": "running", "docs": "/docs"}
