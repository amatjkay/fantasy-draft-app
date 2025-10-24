# РОЛЬ И КОНТЕКСТ

Ты — senior full-stack разработчик со специализацией на TypeScript, Node.js, Socket.IO и production-ready архитектуре для small-scale веб-приложений (до 100 concurrent users).

---

# ПРОЕКТ

**Fantasy Draft App (NHL)** — real-time драфт приложение для хоккейных fantasy-лиг.

## Текущий стек
- **Backend**: Node.js 20 + TypeScript + Express + Socket.IO + Vitest
- **Frontend**: React 18 + TypeScript + Vite
- **Database**: SQLite (better-sqlite3)
- **Testing**: 47+ unit/integration tests, e2e на Playwright (3 браузера)
- **CI/CD**: GitHub Actions

## Репозиторий
https://github.com/amatjkay/fantasy-draft-app

## Документация
- `REQUIREMENTS.md` (актуальная редакция 22.10.2025)
- `TECHNICAL_SPEC.md`
- `README.md` с инструкциями по запуску

---

# ОГРАНИЧЕНИЯ И ТРЕБОВАНИЯ

1. **Бюджет инфраструктуры**: $0/месяц (только бесплатные сервисы)
2. **Целевая нагрузка**: 50-100 concurrent users максимум
3. **Сохранить текущий стек**: SQLite + single Node.js instance (достаточно для масштаба)
4. **Без breaking changes**: все изменения должны быть backward-compatible
5. **Все тесты должны проходить**: 47 unit/integration + e2e на 3 браузерах

---

# ЗАДАЧИ ДЛЯ РЕАЛИЗАЦИИ

## Приоритет 1: SECURITY (КРИТИЧНО)

### 1.1 Rate Limiting
- **Библиотека**: `express-rate-limit` (https://www.npmjs.com/package/express-rate-limit)
- **Эндпоинты**: 
  - `/api/auth/*` — 5 req/min
  - `/api/draft/pick` — 10 req/min
  - Все остальные — 100 req/min
- **Responses**: HTTP 429 с Retry-After header
- **Тесты**: Добавить unit-тесты на превышение лимита

### 1.2 CSRF Protection
- **Библиотека**: `csurf` (https://www.npmjs.com/package/csurf)
- **Интеграция**: Middleware для всех POST/PUT/DELETE endpoints
- **Frontend**: Автоматическая передача CSRF token через axios interceptor
- **Session storage**: Использовать текущий express-session (in-memory допустимо для 50-100 users)
- **Тесты**: E2E тест на CSRF token validation

### 1.3 Input Sanitization
- **Библиотека**: `express-validator` + `DOMPurify` (https://www.npmjs.com/package/express-validator)
- **Поля для санитизации**: login, teamName, любые текстовые inputs
- **Валидация**: 
  - teamName max 50 chars
  - login alphanumeric + underscore
  - no HTML tags
- **Тесты**: Негативные тесты на XSS payload (e.g., `<script>alert('xss')</script>`)

### 1.4 Secure Headers
- **Библиотека**: `helmet` (уже должен быть, проверить настройки)
- **Настройки**: 
```javascript
helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // для Vite HMR в dev
      connectSrc: ["'self'", "wss://your-domain.com"], // WebSocket
    },
  },
})
```

---

## Приоритет 2: RELIABILITY

### 2.1 Graceful Shutdown
- **Цель**: Корректное закрытие WebSocket соединений при SIGTERM/SIGINT
- **Реализация**:
```javascript
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing server...');
  io.close(() => console.log('Socket.IO closed'));
  server.close(() => {
    db.close();
    process.exit(0);
  });
});
```
- **Timeout**: 10 секунд на graceful shutdown, затем force exit
- **Тесты**: Integration test на корректное закрытие

### 2.2 Error Handling Middleware
- **Централизованный обработчик**:
```javascript
app.use((err, req, res, next) => {
  logger.error({ err, req: { method: req.method, url: req.url } });
  res.status(err.status || 500).json({ 
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal Server Error' 
      : err.message 
  });
});
```
- **Async error wrapper**: Обернуть все async route handlers
- **Тесты**: Unit-тесты на различные типы ошибок (ValidationError, DatabaseError, etc.)

### 2.3 Health Check Endpoint
- **Endpoint**: `GET /health`
- **Проверки**:
  - Database connection (SQLite query `SELECT 1`)
  - Socket.IO status (количество подключений)
  - Memory usage (process.memoryUsage())
- **Response format**:
```json
{
  "status": "healthy",
  "timestamp": "2025-10-23T13:46:00Z",
  "checks": {
    "database": "ok",
    "socketio": "ok (12 connections)",
    "memory": "ok (150MB / 512MB)"
  }
}
```

### 2.4 Structured Logging
- **Библиотека**: `winston` (https://www.npmjs.com/package/winston)
- **Формат**: JSON для production, pretty-print для dev
- **Уровни**: error, warn, info, http, debug
- **Логи включают**: timestamp, level, message, requestId (uuid), userId (если есть)
- **Замена**: Все `console.log` → `logger.info/debug`
- **Rotation**: winston-daily-rotate-file (опционально, если нужно)

---

## Приоритет 3: CODE QUALITY

### 3.1 Better TypeScript Types
- **Strict mode**: Включить `strict: true` в tsconfig.json (если ещё нет)
- **Избавиться от `any`**: Заменить на конкретные типы или `unknown`
- **Zod inference**: Использовать `z.infer<typeof Schema>` вместо дублирования типов
- **Example**:
```typescript
const UserSchema = z.object({
  id: z.string().uuid(),
  login: z.string().min(3).max(20),
  teamName: z.string().min(1).max(50),
});
type User = z.infer<typeof UserSchema>;
```

### 3.2 Error Messages UX
- **Frontend**: Показывать user-friendly ошибки вместо raw error codes
- **Примеры**:
  - `"Not your turn!"` → `"⏳ Подождите своего хода (сейчас ходит Team Alpha)"`
  - `"Salary cap exceeded!"` → `"💰 Превышен лимит зарплат ($95M). У вас осталось $2.5M"`
  - `"Player already picked!"` → `"❌ Этот игрок уже выбран командой Team Beta"`
- **Toast notifications**: Использовать существующую систему уведомлений

### 3.3 Loading States
- **Skeleton screens**: Для таблицы игроков во время загрузки
- **Button disabled states**: Кнопка "Pick" disabled во время API call
- **Spinner на draft pick**: Показать индикатор отправки пика

---

## Приоритет 4: OPTIONAL ENHANCEMENTS (если время позволяет)

### 4.1 Redis для Session Store (Upstash Free Tier)
- **Сервис**: Upstash Redis Free (10,000 commands/day = достаточно для 50 users)
- **Библиотека**: `connect-redis` + `ioredis`
- **Настройка**:
```javascript
const RedisStore = require('connect-redis').default;
const { Redis } = require('ioredis');
const redisClient = new Redis(process.env.UPSTASH_REDIS_URL);

app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
}));
```
- **Fallback**: Если Redis недоступен, использовать in-memory store с warning в логах

### 4.2 Environment Variables Validation
- **Библиотека**: `dotenv-safe` или Zod для .env валидации
- **Обязательные переменные**: SESSION_SECRET, PORT, NODE_ENV
- **Fail-fast**: Если переменные не заданы, сервер не стартует с понятной ошибкой

---

# КРИТЕРИИ ПРИЁМКИ

1. ✅ Все 47 существующих тестов проходят
2. ✅ E2E тесты на 3 браузерах проходят
3. ✅ CI/CD pipeline зелёный (GitHub Actions)
4. ✅ Добавлено минимум 10 новых тестов на security & reliability
5. ✅ Нет новых ESLint warnings
6. ✅ TypeScript компилируется без ошибок (`npm run build` успешен)
7. ✅ README.md обновлён с новыми env переменными и инструкциями

---

# ПОСЛЕДОВАТЕЛЬНОСТЬ РЕАЛИЗАЦИИ

1. **День 1-2**: Security (rate limiting, CSRF, input sanitization)
2. **День 3**: Reliability (graceful shutdown, error handling, health check)
3. **День 4**: Code quality (TypeScript strict mode, error messages UX)
4. **День 5**: Structured logging (Winston) + тестирование всего
5. **День 6-7**: Опциональные улучшения (Redis session store, env validation)

---

# ВАЖНЫЕ ЗАМЕЧАНИЯ

- **НЕ ТРОГАТЬ**: Основную бизнес-логику (DraftRoom, snake draft, salary cap)
- **НЕ МЕНЯТЬ**: SQLite на PostgreSQL (избыточно для 50-100 users)
- **НЕ ДОБАВЛЯТЬ**: Clustering, load balancing, APM tools (overkill)
- **СОХРАНИТЬ**: Все существующие API endpoints и WebSocket события

---

# DELIVERABLES

1. Pull Request с изменениями (разбить на логические коммиты)
2. Обновлённые тесты (отдельный коммит)
3. Обновлённая документация (README.md, .env.sample)
4. Changelog с описанием всех изменений

---

# ВОПРОСЫ ДЛЯ УТОЧНЕНИЯ (опционально)

Если что-то неясно из требований или архитектуры — задай вопросы перед началом реализации. Особенно критично понимание:

- Текущей логики сессий (как userId попадает в Socket.IO)
- Структуры тестов (где добавлять новые)
- CI/CD pipeline (нужно ли обновлять .github/workflows/ci.yml)

---

# ОЖИДАЕМЫЙ РЕЗУЛЬТАТ

После выполнения всех задач проект получит:

| Метрика | До улучшений | После улучшений |
|---------|-------------|-----------------|
| **Security Score** | ⚠️ 6/10 | ✅ 9/10 |
| **Reliability** | ⚠️ 7/10 | ✅ 9/10 |
| **Code Quality** | ✅ 8/10 | ✅ 9/10 |
| **Scalability** | ✅ 7/10 | ✅ 7/10 |
| **Cost** | ✅ $0/месяц | ✅ $0/месяц |

**Проект готов к production deployment на бесплатном tier с поддержкой 50-100 concurrent users.**
