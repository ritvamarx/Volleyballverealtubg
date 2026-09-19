# Content-Hub Renderer (Stufe 5): HTML-Vorlage + JSON → PNG
# Playwright-Basisimage bringt Chromium mit; Speicherbedarf ~0,5 GB in der Spitze.
FROM mcr.microsoft.com/playwright/python:v1.47.0-jammy
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
RUN pip install --no-cache-dir flask==3.0.* jinja2 gunicorn
COPY app.py .
RUN useradd --create-home --uid 1000 appuser && chown -R appuser /app
USER appuser
EXPOSE 8000
CMD ["gunicorn", "--workers", "1", "--threads", "2", "--timeout", "120", "--bind", "0.0.0.0:8000", "app:app"]
