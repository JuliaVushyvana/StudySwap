# StudySwap
Платформа для обміну навчальними матеріалами між студентами. Діліться конспектами, лекціями та шпаргалками, знаходьте потрібне за предметом і курсом

## API документація

Контракт API описано у форматі OpenAPI 3.0: [docs/api/openapi.yaml](docs/api/openapi.yaml)

Специфікацію перевірено в [Swagger Editor](https://editor.swagger.io/):

![Swagger Editor](docs/api/swagger_screenshot.png)

## Запуск і тести

```bash
cd backend
npm install
npm start   # API на http://localhost:3000, перевірка: GET /health → ok
npm test    # юніт-тести рівня service/
```

Вхід (`POST /auth/login`) ще не реалізовано, тому для запитів, що змінюють дані, поки використовуються тестові токени в заголовку `Authorization: Bearer <токен>`: `dev-token-anna`, `dev-token-ivan` (користувачі) і `dev-token-admin` (адмін).

## Docker

### 1. Перевірка встановлення Docker

Docker Desktop для Windows: https://docs.docker.com/desktop/setup/install/windows-install/
(якщо інсталятор просить «Virtual Machine Platform»: `wsl --install` у PowerShell від адміністратора, перезавантаження, повторне встановлення).

```bash
docker version
docker run hello-world
```

Очікуваний результат: у виводі є `Hello from Docker!`.

![docker run hello-world](docs/docker/hello-world.png)

### 2. Контейнер бекенду

Файли: [backend/Dockerfile](backend/Dockerfile), [backend/.dockerignore](backend/.dockerignore).
Образ: Node.js 22 (`node:22-bookworm-slim`), бо `better-sqlite3` 13 вимагає Node 22+.

Команди виконуються з кореня репозиторію:

```bash
# зібрати образ
docker build -t studyswap-api:1.0.0 ./backend

# запустити контейнер: порт 3000 у контейнері -> 3000 на комп'ютері
docker run --name studyswap-api --rm -d -p 3000:3000 studyswap-api:1.0.0

# перевірити
docker ps                                # STATUS: Up ... (healthy)
curl http://localhost:3000/health        # {"status":"ok",...}
curl http://localhost:3000/materials     # JSON зі списком матеріалів
docker logs -f studyswap-api             # Server running on http://localhost:3000 (Ctrl+C — вийти з логів)

# зупинити (контейнер видалиться сам через --rm)
docker stop studyswap-api
```

Порт доступу: **http://localhost:3000**. Фронтенд (`frontend/index.html`) працює з контейнером без змін.
База SQLite створюється всередині контейнера і зникає після `docker stop`: при кожному запуску — тестові дані з `seed.js`.

Налаштування передаються змінними середовища, наприклад режим штучних збоїв для перевірки фронтенду (Практика 5):

```bash
docker run --name studyswap-api --rm -d -p 3000:3000 -e CHAOS=1 studyswap-api:1.0.0
```

![Контейнер запущений](docs/docker/container-running.png)

### 3. Увесь застосунок через docker compose

Файл: [docker-compose.yml](docker-compose.yml). Dockerfile-и: [frontend/Dockerfile](frontend/Dockerfile) (Nginx зі статичним фронтендом), [backend/Dockerfile](backend/Dockerfile) (API).

| Сервіс | Образ | Адреса |
|---|---|---|
| `web` | `studyswap-web:1.0.0` (збирається з `./frontend`) | http://localhost:8080 |
| `api` | `studyswap-api:1.0.0` (збирається з `./backend`) | http://localhost:3000 |
| `db` | `coleifer/sqlite-web` (перегляд бази SQLite) | http://localhost:8081 |

Фронтенд у браузері звертається до API за `http://localhost:3000`, CORS на API увімкнено.
База — SQLite: файл `/app/data/studyswap.db` у томі `api-data`, тому матеріали не зникають після `docker compose down`.
SQLite — це файл, а не окремий сервер, тож замість Postgres сервіс `db` — веб-переглядач того самого файлу бази (лише читання, записує тільки API). На http://localhost:8081 видно таблиці `materials`, `users`, `stored_files`, `idempotency_keys`; `db` стартує, коли API вже healthy і створив таблиці.

Команди виконуються з кореня репозиторію:

```bash
# зібрати образи й підняти всі сервіси у фоні
docker compose up -d --build

# перевірити
docker compose ps                        # api: Up (healthy), web і db: Up
curl http://localhost:3000/health        # {"status":"ok","checks":{"database":"ok"}}
curl http://localhost:3000/materials     # JSON зі списком матеріалів
docker compose logs -f api               # Server running on http://localhost:3000
# фронтенд: http://localhost:8080, база: http://localhost:8081

# зупинити й видалити контейнери (томи з даними лишаються)
docker compose down

# те саме, але разом із даними (наступний запуск — знову тестові дані з seed.js)
docker compose down -v
```
