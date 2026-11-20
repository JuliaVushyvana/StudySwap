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
