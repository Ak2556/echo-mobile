# Production image for the Echo FastAPI backend.
#
# Build locally for parity checks:
#   docker build -t echo-backend ./backend
#   docker run --rm -p 8000:8000 --env-file ./backend/.env echo-backend
#
# Deploys: Railway/Render via the included config files. PORT is supplied
# by the platform and defaults to 8000 locally.

FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# System deps kept minimal; supabase-py + openai have no native build needs.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Drop privileges for the runtime.
RUN useradd --create-home --uid 1001 echo && chown -R echo:echo /app
USER echo

EXPOSE 8000

# Healthcheck hits the existing /health route. Railway/Render use this for
# zero-downtime deploys; local docker run uses it for restart policies.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl --fail --silent http://127.0.0.1:${PORT:-8000}/health || exit 1

# Use sh -c so ${PORT} is expanded by the platform's env at runtime.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
