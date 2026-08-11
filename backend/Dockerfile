FROM python:3.10-slim

# Install system utilities
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright and its system-level dependencies for Chromium
RUN playwright install chromium
RUN playwright install-deps chromium

# Copy the application code
COPY . .

# Expose FastAPI default port
EXPOSE 8000

# Run Uvicorn ASGI server
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
