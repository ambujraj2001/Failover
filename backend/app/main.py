import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy import text

from app.api.routes import auth, content, demo, flashcards, interviews, labs, me
from app.content.loader import get_content
from app.core.config import get_settings
from app.core.db import engine
from app.core.errors import install_error_handlers

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("failover")


@asynccontextmanager
async def lifespan(_: FastAPI):
    c = get_content()  # fail fast on broken content
    s = get_settings()
    log.info("content loaded: %d labs, %d lessons, %d concepts", len(c.labs), len(c.lessons), len(c.concepts))
    log.info("AI assistant: %s", f"enabled ({s.deepseek_model})" if s.ai_enabled else "disabled")
    yield
    await engine.dispose()


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(title=f"{s.app_name} API", version="0.1.0", lifespan=lifespan,
                  docs_url=None if s.is_production else "/docs", redoc_url=None,
                  openapi_url=None if s.is_production else "/openapi.json")
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(CORSMiddleware, allow_origins=s.cors_origins, allow_credentials=True,
                       allow_methods=["*"], allow_headers=["*"])
    install_error_handlers(app)

    @app.middleware("http")
    async def security_headers(request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("X-Frame-Options", "DENY")
        return response

    for r in (auth.router, me.router, content.router, labs.router, flashcards.router, interviews.router,
              demo.router):
        app.include_router(r, prefix=s.api_prefix)

    @app.get(f"{s.api_prefix}/health", tags=["ops"])
    async def health():
        async with engine.connect() as conn:
            await conn.execute(text("select 1"))
        return {"status": "ok", "ai": s.ai_enabled}

    return app


app = create_app()
