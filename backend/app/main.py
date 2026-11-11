"""
FLOODGUARD: Intelligent Dam Break & Flood Inundation Simulation Platform
========================================================================
SIH 2026 Problem Statement: SIH26161 (NTRO)
FastAPI Main Application Server
"""

import os
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .database.db import init_db
from .services.demo_data import seed_database_if_empty
from .api.endpoints import router as api_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Ensure database exists and seed demonstration datasets
    init_db()
    seed_database_if_empty()
    print("FLOODGUARD backend initialized with Indian demonstration datasets.")
    yield
    print("FLOODGUARD backend shutting down.")

app = FastAPI(
    title="FLOODGUARD Disaster Management Platform",
    description="Intelligent Dam Break & Flood Inundation Simulation Platform for SIH 2026 PS SIH26161 (NTRO)",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include core REST API router
app.include_router(api_router, prefix="/api")

# Mount outputs directory for downloads
outputs_dir = Path(__file__).resolve().parent.parent.parent / "outputs"
outputs_dir.mkdir(parents=True, exist_ok=True)
app.mount("/static/outputs", StaticFiles(directory=str(outputs_dir)), name="outputs")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="127.0.0.1", port=8000, reload=True)
