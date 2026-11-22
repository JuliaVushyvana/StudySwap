# Образ бекенду StudySwap (Express + SQLite). Два етапи (multi-stage build).
# better-sqlite3 13 вимагає Node >= 22 і компілюється під час npm ci (готової збірки під Linux немає).

# ---------- Етап 1: збирання залежностей ----------
# Тут є Python, make і g++, потрібні для компіляції better-sqlite3
FROM node:22-bookworm-slim AS deps

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Залежності окремим шаром: якщо package*.json не змінився, Docker бере їх з кешу
COPY package*.json ./
RUN npm ci --omit=dev

# ---------- Етап 2: робочий образ ----------
# Без компіляторів: лише Node.js, готові node_modules і код
FROM node:22-bookworm-slim

WORKDIR /app

# Порт сервера (backend/config.js читає PORT). Інші налаштування — через docker run -e:
# CHAOS=1, REQUEST_TIMEOUT_MS, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX
ENV PORT=3000

COPY --from=deps /app/node_modules ./node_modules
# Код застосунку (що не копіювати — див. .dockerignore)
COPY . .

EXPOSE 3000

# Docker сам перевіряє GET /health; стан видно в `docker ps` (healthy / unhealthy)
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:' + process.env.PORT + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
