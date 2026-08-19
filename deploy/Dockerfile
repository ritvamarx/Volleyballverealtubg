# SKV Müritz Volleyball – App-Image
# Gleiches Muster wie die übrigen nettverwaltet-Dienste:
# python:3.12-slim, Gunicorn 1 Worker / 8 Threads, unprivilegierter Nutzer.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    VOLLEYBALL_DATA_DIR=/app/data

WORKDIR /app

COPY server/requirements.txt server/requirements.txt
RUN pip install --no-cache-dir -r server/requirements.txt

COPY server/ server/
COPY index.html ./
COPY assets/ assets/

RUN useradd --create-home --uid 1000 appuser \
    && mkdir -p /app/data \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000
WORKDIR /app/server
CMD ["gunicorn", "--workers", "1", "--threads", "8", "--bind", "0.0.0.0:8000", \
     "--access-logfile", "-", "app:create_app()"]
