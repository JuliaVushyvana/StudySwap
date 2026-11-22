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

Реєстрація й вхід: `POST /auth/register`, `POST /auth/login` (логін або пошта + пароль) → JWT, `POST /auth/logout`. Запити, що змінюють дані, передають токен у заголовку `Authorization: Bearer <JWT>`. Тестові акаунти з `seed.js`: `anna_k`, `julia_v` (користувачі) і `admin1` (адмін), пароль у всіх — `studyswap123`.

Змінні середовища для входу: `JWT_SECRET` (ключ підпису; значення за замовчуванням лише для локальної розробки), `TOKEN_TTL_SECONDS` (строк дії токена, 3600), `BCRYPT_ROUNDS` (вартість хешування, 10).

> Якщо `backend/data.db` створено до появи входу, тестові акаунти мають заглушки замість хешів паролів: видаліть `data.db`, і seed створить їх заново.
