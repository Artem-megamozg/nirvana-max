# ============================================================
# Dockerfile — сборка backend (FastAPI) + frontend (React)
# ============================================================
# Многоступенчатая сборка:
#   Этап 1 (node)    — собирает React в /app/web
#   Этап 2 (python)  — ставит FastAPI и копирует собранный фронт
# ============================================================

# --- Этап 1: сборка фронтенда ---
FROM node:20-alpine AS frontend

WORKDIR /frontend

# Сначала копируем только манифесты — чтобы кэшировался npm install
COPY frontend/package*.json ./
RUN npm install

# Копируем исходники и собираем в /web (см. vite.config.js: outDir: '../web')
COPY frontend/ ./
RUN npm run build


# --- Этап 2: backend ---
FROM python:3.10-slim

WORKDIR /app

# Системные зависимости: ca-certificates — чтобы работал SSL с MAX API
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Python-зависимости
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Корневые сертификаты Минцифры (для platform-api2.max.ru)
COPY certs/ /usr/local/share/ca-certificates/
RUN update-ca-certificates

# Код backend
COPY main.py .

# Собранный фронтенд из этапа 1
COPY --from=frontend /web ./web

# Порт, на котором слушает uvicorn
EXPOSE 8000

# Запуск
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
