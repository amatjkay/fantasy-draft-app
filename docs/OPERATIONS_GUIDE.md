# 🚀 Fantasy Draft App — Руководство по Эксплуатации

**Версия:** 1.0  
**Дата обновления:** 2025-10-24  
**Статус:** Production Ready для малой аудитории (5-20 users)

---

## 📋 Содержание

1. [Быстрый Старт](#быстрый-старт)
2. [Способы Запуска](#способы-запуска)
3. [Мониторинг и Логирование](#мониторинг-и-логирование)
4. [Production Deployment](#production-deployment)
5. [Тестирование](#тестирование)
6. [Troubleshooting](#troubleshooting)
7. [Архитектура](#архитектура)

---

## 🎯 Быстрый Старт

### Для Разработки (Рекомендуется для Windows)

```bash
# 1. Запустить проект с автоматическим мониторингом
npm run monitor:start

# 2. Проверить статус
npm run monitor:status

# 3. Открыть приложение
# Client: http://localhost:5173
# Server API: http://localhost:3001
# Health Check: http://localhost:3001/health

# 4. Остановить
npm run monitor:stop
```

**Что это дает?**
- ✅ Автоматический запуск server + client
- ✅ Автоперезапуск при падении (до 10 раз)
- ✅ Логирование в файлы `logs/`
- ✅ Health checks каждые 30 секунд
- ✅ Статус каждые 60 секунд в консоли

---

## 🛠️ Способы Запуска

### 1. Process Monitor (Рекомендуется для Windows)

**Нативное решение без внешних зависимостей**

```bash
# Development
npm run monitor:start      # Запустить dev режим
npm run monitor:status     # Проверить статус
npm run monitor:stop       # Остановить

# Production
npm run build:all          # Собрать проект
npm run monitor:prod       # Запустить production
```

**Логи:** `logs/server-out.log`, `logs/server-error.log`, `logs/client-out.log`, `logs/client-error.log`

**Преимущества:**
- ✅ Работает на 100% на Windows
- ✅ Автоматический перезапуск
- ✅ Graceful shutdown
- ✅ Health checks
- ✅ PID tracking

### 2. PM2 (Альтернатива, если настроен)

**Production-ready process manager**

```bash
# Первичная настройка (один раз)
npm run pm2:setup

# Development
npm run pm2:start         # Запустить
npm run pm2:status        # Статус
npm run pm2:logs          # Логи
npm run pm2:monitor       # Dashboard
npm run pm2:stop          # Остановить

# Production
npm run pm2:prod          # Собрать и запустить
```

⚠️ **Примечание:** PM2 может иметь проблемы на Windows (`spawn EINVAL`). Используйте Process Monitor если PM2 не работает.

### 3. Orchestrator (Классический способ)

**Базовый скрипт без автоперезапуска**

```bash
# Development
npm run dev:all           # Запустить в текущем терминале
npm run svc:status        # Проверить статус
npm run svc:stop          # Остановить

# Production
npm run prod:all          # Собрать и запустить

# E2E Testing
npm run e2e:serve         # Запустить для E2E тестов
```

---

## 📊 Мониторинг и Логирование

### Статус Процессов

```bash
# Process Monitor
npm run monitor:status

# PM2
npm run pm2:status

# Orchestrator
npm run svc:status
```

### Просмотр Логов

#### Process Monitor / PM2

Логи автоматически сохраняются в `logs/`:

```
logs/
├── server-out.log       # Server stdout
├── server-error.log     # Server stderr  
├── client-out.log       # Client stdout
└── client-error.log     # Client stderr
```

**Просмотр в реальном времени (PowerShell):**

```powershell
# Следить за логами
Get-Content logs\server-out.log -Wait

# Или в блокноте
notepad logs\server-out.log
```

**Просмотр только ошибок:**

```bash
# PM2
npm run pm2:logs:error

# Process Monitor
notepad logs\server-error.log
```

#### Ротация Логов (PM2)

PM2 автоматически ротирует логи:
- Максимальный размер: 10MB
- Хранение: 7 дней
- Архивация: gzip

### Health Checks

Server предоставляет health check endpoint:

```bash
# Проверка доступности
curl http://localhost:3001/health

# Ответ:
# {"status":"ok","timestamp":1234567890}
```

Process Monitor и PM2 автоматически проверяют этот endpoint каждые 30-60 секунд.

---

## 🚀 Production Deployment

### Подготовка

1. **Настройте переменные окружения**

   Создайте `server/.env` (используйте `.env.example` как шаблон):
   ```env
   NODE_ENV=production
   PORT=3001
   
   # Используйте случайную строку 64+ символов
   SESSION_SECRET=<random-64-char-string>
   
   # Учетные данные админа (обязательно измените!)
   ADMIN_LOGIN=your_admin_login
   ADMIN_PASSWORD=your_secure_password
   
   USE_SQLITE=1
   DB_FILE=./data/draft.db
   TIMER_SEC=60
   ```
   
   ⚠️ **НИКОГДА не коммитьте `.env` в Git!** Он уже в `.gitignore`.

2. **Соберите проект**

   ```bash
   npm run build:all
   ```

   Это выполнит:
   - `cd server && npm run build` (TypeScript → JavaScript)
   - `cd client && npm run build` (Vite → static files)

3. **Запустите в production режиме**

   ```bash
   # Process Monitor
   npm run monitor:prod

   # Или PM2
   npm run pm2:prod
   ```

### Deployment на VPS (Railway / Render)

**Build Command:**
```bash
cd server && npm install && npm run build
```

**Start Command:**
```bash
cd server && npm start
```

**Environment Variables:**
- `NODE_ENV=production`
- `PORT=3001`
- `SESSION_SECRET=<your-secret>`
- `USE_SQLITE=1`

**Health Check:**
- URL: `/health`
- Interval: 60 seconds

### Автозапуск при Старте Системы (PM2)

```bash
# Настроить автозапуск
pm2 startup

# Сохранить текущую конфигурацию
pm2 save

# Отключить автозапуск
pm2 unstartup
```

---

## 🧪 Тестирование

### Unit & Integration Tests

```bash
# Запустить все тесты
cd server && npm test

# Запустить в watch режиме
cd server && npm run test:watch
```

**Coverage:** 47+ тестов covering core business logic

### E2E Tests (Playwright)

```bash
# Запустить все E2E тесты (3 браузера)
npm run e2e

# Запустить UI mode для debugging
npm run e2e:ui

# Запустить конкретный браузер
npx playwright test --project=chromium

# Запустить с трейсами
npx playwright test --trace on

# Посмотреть отчет
npx playwright show-report
```

**Тесты:**
- `smoke.spec.ts` — базовая проверка
- `rbac.spec.ts` — ролевой доступ (admin/user)
- `admin.spec.ts` — админ-панель
- `allteams.spec.ts` — мультиюзерный драфт
- `reconnect.spec.ts` — переподключение

**Статус:** ✅ Все 18 тестов стабильно проходят (Chromium, Firefox, WebKit)

### Manual Testing

1. **Запустите проект:**
   ```bash
   npm run monitor:start
   ```

2. **Откройте в браузере:**
   - http://localhost:5173

3. **Создайте пользователей:**
   - Зарегистрируйте 2-3 пользователя
   - Первый пользователь автоматически становится admin

4. **Проверьте основной flow:**
   - Создание комнаты
   - Присоединение участников
   - Добавление ботов
   - Запуск драфта
   - Выбор игроков
   - Завершение драфта

---

## 🔧 Troubleshooting

### Проблема: Порты заняты (5173 или 3001)

```bash
# Windows: Найти процесс
netstat -ano | findstr :5173
netstat -ano | findstr :3001

# Убить процесс по PID
taskkill /PID <PID> /F

# Или остановите через менеджер
npm run monitor:stop
npm run pm2:stop
npm run svc:stop
```

### Проблема: Процессы постоянно перезапускаются

```bash
# Проверьте логи ошибок
notepad logs\server-error.log

# Остановите процессы
npm run monitor:stop

# Исправьте проблему в коде
# Запустите снова
npm run monitor:start
```

### Проблема: База данных заблокирована

```bash
# Остановите все процессы
npm run monitor:stop

# Удалите lock файлы (если есть)
del server\data\*.db-wal
del server\data\*.db-shm

# Запустите снова
npm run monitor:start
```

### Проблема: Client не подключается к Server

**Проверьте:**

1. Server запущен и доступен:
   ```bash
   curl http://localhost:3001/health
   ```

2. CORS настроен правильно (в `server/src/app.ts`):
   ```typescript
   app.use(cors({
     origin: 'http://localhost:5173',
     credentials: true
   }));
   ```

3. Client использует правильный URL (в `client/src/services/*.ts`):
   ```typescript
   const BASE_URL = 'http://localhost:3001';
   ```

### Проблема: E2E тесты падают

```bash
# Убедитесь что порты свободны
npm run svc:stop
npm run monitor:stop

# Запустите тесты с UI для debugging
npm run e2e:ui

# Или с трейсами
npx playwright test --trace on

# Посмотрите трейсы
npx playwright show-trace test-results/.../trace.zip
```

### Проблема: PM2 не запускается (spawn EINVAL на Windows)

**Решение:** Используйте Process Monitor вместо PM2:

```bash
npm run monitor:start
```

Process Monitor — это нативное решение для Windows без проблем PM2.

---

## 🏗️ Архитектура

### Технологический Стек

**Frontend:**
- React 18.2 + TypeScript
- Vite 5.0 (dev server + build tool)
- Socket.IO Client (real-time)
- Vanilla CSS (styling)

**Backend:**
- Node.js + Express 4.19
- Socket.IO 4.7 (WebSocket)
- TypeScript 5.6
- Better-SQLite3 12.4 (database)
- Zod 3.23 (validation)
- Bcrypt 6.0 (password hashing)

**Security:**
- Helmet (security headers)
- CSRF protection (csurf)
- Rate limiting (express-rate-limit)
- Session management (express-session)

**Testing:**
- Vitest (unit/integration)
- Playwright (E2E, 3 browsers)

### Архитектурные Паттерны

- **Singleton:** `DraftRoomManager` (единый экземпляр для REST + Socket.IO)
- **Repository:** `UserRepository`, `PlayerRepository`, `PickRepository`
- **Service Layer:** `draft.ts`, `lobby.ts`, `draftTimer.ts`
- **Event-Driven:** Socket.IO для real-time обновлений
- **Middleware Chain:** Auth → CSRF → Rate Limit → Routes

### Структура Проекта

```
fantasy-draft-app/
├── client/                # Frontend (React + Vite)
│   ├── src/
│   │   ├── components/   # React компоненты
│   │   ├── services/     # API + Socket services
│   │   └── styles/       # CSS
│   └── package.json
├── server/               # Backend (Node.js + Express)
│   ├── src/
│   │   ├── routes/       # REST API endpoints
│   │   ├── services/     # Business logic
│   │   ├── persistence/  # Database repositories
│   │   ├── middleware/   # Auth, CSRF, Rate limit
│   │   └── models.ts     # Data models + validation
│   └── package.json
├── e2e/                  # Playwright E2E tests
├── scripts/              # Utility scripts
│   ├── orchestrator.js  # Classic launcher
│   ├── monitor.js       # Process monitor (recommended)
│   └── setup-pm2.js     # PM2 setup
├── logs/                 # Application logs
└── docs/                 # Documentation
```

### Endpoints

**REST API:**
- `POST /api/auth/register` — Регистрация
- `POST /api/auth/login` — Вход
- `POST /api/auth/logout` — Выход
- `GET /api/rooms` — Список комнат
- `POST /api/rooms` — Создать комнату
- `POST /api/draft/pick` — Сделать выбор
- `GET /health` — Health check

**Socket.IO Events:**
- `lobby:join` — Присоединение к лобби
- `lobby:participants` — Список участников
- `draft:state` — Состояние драфта
- `draft:pick` — Новый выбор
- `timer:tick` — Тик таймера

### База Данных (SQLite)

**Таблицы:**
- `users` — Пользователи (id, login, passwordHash, teamName, role)
- `players` — Игроки NHL (~700 записей)
- `picks` — История выборов драфта

**Расположение:** `server/data/draft.db`

**Backup:** Рекомендуется ежедневный cron:
```bash
0 2 * * * cp server/data/draft.db backups/draft-$(date +\%Y\%m\%d).db
```

---

## 📚 Дополнительная Документация

- **Техническая Спецификация:** [TECHNICAL_SPEC.md](../TECHNICAL_SPEC.md)
- **Технический Аудит:** [TECHNICAL_AUDIT.md](../TECHNICAL_AUDIT.md)
- **QA Отчет:** [QA_REVIEW_FINAL.md](../QA_REVIEW_FINAL.md)
- **Требования:** [REQUIREMENTS.md](../REQUIREMENTS.md)
- **Quick Start:** [QUICKSTART.md](../QUICKSTART.md)

---

## 🎯 Рекомендации

### Для Разработки

1. ✅ Используйте `npm run monitor:start` для запуска
2. ✅ Периодически проверяйте `npm run monitor:status`
3. ✅ Смотрите логи в `logs/` при проблемах
4. ✅ Запускайте тесты перед commit: `npm run e2e`

### Для Production

1. ✅ Используйте `npm run monitor:prod` или `npm run pm2:prod`
2. ✅ Настройте автозапуск (PM2 startup)
3. ✅ Настройте backup базы данных
4. ✅ Мониторьте health check endpoint
5. ✅ Проверяйте логи ошибок ежедневно

### Для Малой Аудитории (5-20 users)

Текущая архитектура **идеальна**:
- ✅ SQLite достаточно
- ✅ In-memory state не проблема
- ✅ Single instance достаточен
- ❌ PostgreSQL не нужен (overkill)
- ❌ Redis не нужен (overkill)
- ❌ Clustering не нужен (overkill)

---

**Документ обновлён:** 2025-10-24  
**Версия:** 1.0  
**Статус:** Ready for Production (малая аудитория)
