FROM python:3.11-slim

WORKDIR /app

# Install system deps for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV FLASK_APP=app:create_app
ENV FLASK_ENV=production

EXPOSE 5001

# Production WSGI server with 2 workers (suitable for lightweight deployments)
CMD ["gunicorn", "--bind=0.0.0.0:5001", "--workers=2", "--timeout=120", "app:create_app()"]
