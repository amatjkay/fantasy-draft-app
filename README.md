# Fantasy Draft App (NHL)

[![CI](https://github.com/amatjkay/fantasy-draft-app/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/amatjkay/fantasy-draft-app/actions/workflows/ci.yml)

Веб-приложение для проведения fantasy-драфта по NHL с real-time поддержкой, salary cap валидацией, мультипозициями игроков и автоматическим подсчётом очков.

**Статус:** MVP завершён. Backend + Frontend готовы, 47+ unit/integration тестов, e2e покрытие на 3 браузерах (Chromium/Firefox/WebKit), CI/CD настроен.

---

## 📋 Содержание

- [Технологический стек](#технологический-стек)
- [Быстрый старт](#быстрый-старт)
- [Персистентность (SQLite)](#персистентность-sqlite)
- [API документация](#api-документация)
- [Структура проекта](#структура-проекта)
- [Роли и права (RBAC)](#роли-и-права-rbac)
- [WebSocket Events](#websocket-events)
- [REST API Endpoints](#rest-api-endpoints)
- [Дорожная карта](#дорожная-карта)

---

## 🛠 Технологический стек

### Backend
- **Runtime:** Node.js 20 LTS
- **Language:** TypeScript 5.x
- **Framework:** Express 4.x
- **Real-time:** Socket.IO 4.x
- **Validation:** Zod 3.x
- **Database:** SQLite (better-sqlite3) или in-memory
- **Security:** bcrypt, helmet, cors, express-session
- **Testing:** Vitest, Supertest, Playwright

### Frontend
- **Framework:** React 18
- **Language:** TypeScript
- **Build:** Vite
- **Styling:** CSS modules + темная тема
- **Real-time:** Socket.IO Client

### CI/CD
- **GitHub Actions:** Автоматические тесты на push/PR
- **E2E:** Playwright на 3 браузерах (Chromium, Firefox, WebKit)

---

## 🚀 Быстрый старт

### Требования
- Node.js 20 LTS (рекомендуется)
- npm или yarn

### Установка

1. **Клонируйте репозиторий**
```bash
git clone https://github.com/amatjkay/fantasy-draft-app.git
cd fantasy-draft-app
```

2. **Установите зависимости сервера**
```bash
cd server
npm install
```

3. **Установите зависимости клиента**
```bash
cd ../client
npm install
```

### Запуск (Development Mode)

**Терминал 1 — Сервер:**
```bash
cd server
npm run dev
```
Сервер запустится на `http://localhost:3001`

**Терминал 2 — Клиент:**
```bash
cd client
npm run dev
```
Клиент запустится на `http://localhost:5173`

### Проверка работы

После запуска откройте:
- **Клиент:** http://localhost:5173
- **Health Check:** http://localhost:3001/health → `{"status":"ok"}`
- **API Docs (Swagger):** http://localhost:3001/api/docs
- **OpenAPI JSON:** http://localhost:3001/api/openapi.json

---

## 💾 Персистентность (SQLite)

По умолчанию сервер работает в **in-memory режиме** (быстрый старт, данные не сохраняются при рестарте).

### Включение постоянного хранения

1. **Установите better-sqlite3** (если ещё не установлен)
```bash
cd server
npm install better-sqlite3
```

2. **Настройте .env**
```bash
cp .env.sample .env
```

Отредактируйте `.env`:
```env
USE_SQLITE=1
DB_FILE=./data/draft.db
SESSION_SECRET=your-secret-key-change-in-production
PORT=3001
CORS_ORIGIN=
```

3. **Перезапустите сервер**
```bash
npm run dev
```

### Проверка персистентности

1. Создайте комнату и сделайте несколько пиков
2. Перезапустите сервер
3. Вызовите:
   - `GET /api/draft/rooms` — комната должна отображаться
   - `GET /api/draft/history?roomId=<id>` — история пиков сохранена

**Примечание:** База данных создаётся автоматически в `server/data/draft.db`

---

## 📚 API документация

### Swagger UI
**URL:** http://localhost:3001/api/docs

Интерактивная документация всех endpoints с возможностью тестирования прямо в браузере.

### OpenAPI Specification
**URL:** http://localhost:3001/api/openapi.json

Полная спецификация API в формате OpenAPI 3.0.

### Примеры запросов (curl)

**Регистрация:**
```bash
curl -i -c cookie.txt -H "Content-Type: application/json" \
  -d '{"login":"demo","password":"pass1234","teamName":"Demo Team"}' \
  http://localhost:3001/api/auth/register
```

**Вход:**
```bash
curl -i -b cookie.txt -c cookie.txt -H "Content-Type: application/json" \
  -d '{"login":"demo","password":"pass1234"}' \
  http://localhost:3001/api/auth/login
```

**Создание драфт-комнаты:**
```bash
ROOM_ID="room-$(openssl rand -hex 4)"

curl -i -b cookie.txt -H "Content-Type: application/json" \
  -d '{"roomId":"'"$ROOM_ID"'","pickOrder":["YOUR_USER_ID"],"timerSec":60}' \
  http://localhost:3001/api/draft/start
```

**Пик игрока:**
```bash
curl -i -b cookie.txt -H "Content-Type: application/json" \
  -d '{"roomId":"'"$ROOM_ID"'","playerId":"player-1"}' \
  http://localhost:3001/api/draft/pick
```

---

## 📁 Структура проекта

```
fantasy-draft-app/
├── .github/
│   └── workflows/
│       └── ci.yml              # GitHub Actions CI/CD
├── server/                     # Backend (Node.js + TypeScript)
│   ├── src/
│   │   ├── __tests__/          # Unit/integration тесты (Vitest)
│   │   ├── adapters/           # External service adapters
│   │   ├── middleware/         # Express middleware
│   │   ├── persistence/        # Database layer (SQLite)
│   │   ├── routes/             # REST API routes
│   │   │   ├── auth.ts         # /api/auth/* endpoints
│   │   │   ├── draft.ts        # /api/draft/* endpoints
│   │   │   └── data.ts         # /api/data/* endpoints
│   │   ├── services/           # Business logic
│   │   ├── utils/              # Helper functions
│   │   ├── app.ts              # Express app setup
│   │   ├── index.ts            # Entry point (HTTP + Socket.IO)
│   │   ├── draft.ts            # DraftRoom logic
│   │   ├── draftTimer.ts       # Timer manager
│   │   ├── lobby.ts            # Lobby manager
│   │   ├── models.ts           # Zod schemas
│   │   └── session.ts          # Session middleware
│   ├── data/                   # SQLite database (gitignored)
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.sample             # Environment variables template
├── client/                     # Frontend (React + TypeScript)
│   ├── src/
│   │   ├── components/         # React components
│   │   │   ├── LoginPage.tsx   # Auth page
│   │   │   ├── Lobby.tsx       # Waiting room
│   │   │   ├── DraftRoom.tsx   # Main draft interface
│   │   │   ├── TeamView.tsx    # Team roster view
│   │   │   └── AllTeams.tsx    # Draft board (all teams)
│   │   ├── styles/             # CSS modules + theme
│   │   ├── App.tsx             # Main app component
│   │   └── main.tsx            # Entry point
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── e2e/                        # End-to-end tests (Playwright)
│   ├── rbac.spec.ts            # RBAC tests
│   ├── allteams.spec.ts        # All Teams page tests
│   ├── reconnect.spec.ts       # Reconnect logic tests
│   └── smoke.spec.ts           # Smoke tests
├── playwright.config.ts        # Playwright configuration
├── README.md                   # Этот файл
├── REQUIREMENTS.md             # Бизнес-требования
├── TECHNICAL_SPEC.md           # Техническая спецификация
└── QUICKSTART.md               # Краткое руководство пользователя
```

---

## 🔐 Роли и права (RBAC)

### Администратор лобби/глобальный админ
**Может:**
- Запускать драфт (`lobby:start`)
- Ставить драфт на паузу/возобновлять (`draft:pause`, `draft:resume`) — только глобальный админ
- Добавлять ботов (`lobby:addBots`)
- Исключать участников (`lobby:kick`)

**НЕ может:**
- Force-pick (принудительный выбор игрока)
- Undo (отмена пиков)
- Вмешиваться в логику драфта

### Участник
**Может:**
- Присоединяться к комнате
- Делать пики в свой ход
- Просматривать составы других команд
- Reconnect при разрыве соединения (60 сек grace period)

### Гость
**Может:**
- Только просматривать (функция в разработке)

---

## 📡 WebSocket Events

### Клиент → Сервер

**Lobby:**
- `lobby:join` — `{roomId, userId, login}`
- `lobby:ready` — `{roomId, userId, ready}`
- `lobby:addBots` — `{roomId, count}` (admin only)
- `lobby:start` — `{roomId, pickOrder}` (admin only)
- `lobby:kick` — `{roomId, userId}` (admin only)

**Draft:**
- `draft:join` — `{roomId}`
- `draft:pick` — `{roomId, userId, playerId}`
- `draft:pause` — `{roomId}` (admin only)
- `draft:resume` — `{roomId}` (admin only)

### Сервер → Клиент

**Lobby:**
- `lobby:participants` — `{participants, adminId}`
- `lobby:ready` — `{userId, ready}`
- `lobby:start` — начало драфта
- `lobby:error` — `{message}`
- `lobby:kicked` — `{roomId}`

**Draft:**
- `draft:state` — полное состояние драфта (после каждого пика)
- `draft:timer` — `{roomId, timerRemainingMs, activeUserId}` (каждую секунду)
- `draft:autopick` — `{roomId, pickIndex, pick}` (при автопике)
- `draft:error` — `{message}`

---

## 🌐 REST API Endpoints

### Authentication (`/api/auth`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/register` | Регистрация нового пользователя | ❌ |
| POST | `/login` | Вход в систему | ❌ |
| POST | `/logout` | Выход из системы | ✅ |

### Draft Management (`/api/draft`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/start` | Создание и запуск драфт-комнаты | ✅ Admin |
| GET | `/room` | Получение состояния драфта | ✅ |
| POST | `/pick` | Выбор игрока | ✅ |
| GET | `/rooms` | Список всех комнат | ✅ |
| GET | `/history` | История пиков комнаты | ✅ |
| GET | `/teams` | Составы всех участников (Draft Board) | ✅ |

### Data (`/api/data`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/team` | Получение своей команды | ✅ |
| GET | `/players` | Список доступных игроков | ❌ |
| GET | `/leaderboard` | Таблица лидеров | ❌ |

### System

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/health` | Health check | ❌ |
| GET | `/api/version` | Версия API | ❌ |

---

## 🧪 Тестирование

### Запуск тестов

**Unit + Integration тесты (Vitest):**
```bash
cd server
npm test
```

**E2E тесты (Playwright):**
```bash
npm run test:e2e
```

**Запуск CI локально:**
```bash
# Установка зависимостей
cd server && npm ci && cd ..
cd client && npm ci && cd ..

# Тесты сервера
cd server && npm test && cd ..

# Сборка клиента
cd client && npm run build && cd ..

# E2E тесты
npx playwright install --with-deps
npx playwright test
```

### Покрытие тестами

| Категория | Количество | Статус |
|-----------|-----------|--------|
| Unit/Integration (Backend) | 47+ | ✅ Проходят |
| E2E (Playwright) | 4 сценария × 3 браузера | ✅ Проходят |
| **Общее покрытие** | **60+ тестов** | ✅ |

---

## 🎯 Дорожная карта

### ✅ MVP (Завершён)
- [x] REST API + Socket.IO
- [x] Real-time драфт с snake draft
- [x] Server-driven таймер (60 сек)
- [x] Автопик при истечении времени
- [x] Salary cap валидация ($95M)
- [x] Мультипозиции (eligiblePositions)
- [x] Lobby с RBAC
- [x] SQLite persistence
- [x] Frontend (React + TypeScript)
- [x] E2E тесты на 3 браузерах
- [x] CI/CD (GitHub Actions)
- [x] Reconnect grace period (60 сек)
- [x] All Teams page (Draft Board)

### 🔄 v1.0 (В разработке)
- [ ] **Security hardening** (rate limiting, CSRF, input sanitization)
- [ ] **Structured logging** (Winston)
- [ ] **Graceful shutdown** (корректное закрытие WebSocket)
- [ ] **Health checks** (DB ping, Socket.IO status)
- [ ] **Error handling improvements** (user-friendly messages)
- [ ] **Полная база NHL игроков** (~700 из NHL API)
- [ ] **Детализированная скоринговая система** (17 метрик для skaters, 7 для goalies)

### 🎯 v2.0 (Roadmap)
- [ ] Redis session store (Upstash Free Tier)
- [ ] PostgreSQL вместо SQLite (для production)
- [ ] Экспорт результатов (CSV/Excel)
- [ ] Email уведомления
- [ ] PWA (мобильное приложение)
- [ ] Docker Compose для деплоя

---

## 🔒 Безопасность

### Реализовано
✅ Session-based auth с httpOnly cookies  
✅ Password hashing (bcrypt)  
✅ CORS настроен (whitelist для production)  
✅ XSS защита (React автоматическое экранирование)  
✅ SQL injection защита (параметризованные запросы)

### В планах
⚠️ Rate limiting (express-rate-limit)  
⚠️ CSRF protection (csurf middleware)  
⚠️ Input sanitization (express-validator)  
⚠️ Secure headers (helmet configuration)

---

## 🤝 Разработка

### Environment Variables

Создайте файл `server/.env` на основе `.env.sample`:

```env
# Server
PORT=3001
NODE_ENV=development

# Session
SESSION_SECRET=change-me-in-production

# Database (опционально)
USE_SQLITE=1
DB_FILE=./data/draft.db

# CORS (опционально, для production)
CORS_ORIGIN=https://your-domain.com

# Timer (опционально)
TIMER_SEC=60
RECONNECT_GRACE_SEC=60
```

### Запуск в Production

**Сервер:**
```bash
cd server
npm run build
npm start
```

**Клиент:**
```bash
cd client
npm run build
# Раздавайте dist/ через nginx или другой static server
```

---

## 📄 Лицензия

Некоммерческий проект для личного использования.

---

## 🐛 Известные проблемы

Смотрите [Issues на GitHub](https://github.com/amatjkay/fantasy-draft-app/issues)

---

## 📞 Поддержка

Если у вас возникли проблемы:
1. Проверьте [QUICKSTART.md](./QUICKSTART.md)
2. Проверьте [TECHNICAL_SPEC.md](./TECHNICAL_SPEC.md)
3. Создайте Issue на GitHub

---

**Удачного драфта! 🏒**
