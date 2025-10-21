# Fantasy Draft App (NHL)

Некоммерческое веб‑приложение для проведения fantasy-драфта по NHL с поддержкой real-time драфт-комнаты, базовых валидаторов состава и подготовкой к учёту salary cap.

Статус: Backend MVP готов (REST API + Socket.IO, salary cap валидация, OpenAPI/Swagger, e2e тесты)

## Содержание
- Технологический стек (первый шаг)
- Запуск локально
- Структура репозитория
- Дорожная карта (MVP → v1)

## Технологический стек (на старте)
- Backend: Node.js + TypeScript, Express, Socket.IO, Zod
- Тесты: Vitest, Supertest
- Инфраструктура (позже): PostgreSQL, Redis (docker-compose)

## Запуск локально
1) Установите Node.js LTS (18/20).
2) Установите зависимости (после подтверждения безопасности):
   - в папке `server`: `npm install`
3) Запуск сервера разработки:
   - в папке `server`: `npm run dev`
4) Настройте окружение (опционально):
   - Скопируйте `server/.env.sample` в `server/.env` и при необходимости задайте значения
   - Важные переменные:
     - `PORT` — порт сервера (по умолчанию 3001)
     - `SESSION_SECRET` — секрет для cookie-сессий (измените в продакшне)
     - `CORS_ORIGIN` — список разрешённых Origins через запятую (оставьте пустым для режима разработки)
5) Проверка работы:
   - Healthcheck: GET http://localhost:3001/health → `{ "status": "ok" }`
   - Версия API: GET http://localhost:3001/api/version
   - OpenAPI JSON: GET http://localhost:3001/api/openapi.json
   - Swagger UI: http://localhost:3001/api/docs

## API Docs
- OpenAPI (JSON): `GET /api/openapi.json`
- Swagger UI: `/api/docs`

## Персистентность (SQLite)

По умолчанию сервер работает в in-memory режиме (быстрый старт, без постоянного хранения). Чтобы включить постоянное хранение (SQLite):

1) Требования
   - Рекомендуется Node.js 20 LTS. Модуль `better-sqlite3` официально поддерживает Node 20+.
   - Windows: установка Node 20 через nvm-windows или официальный установщик.

2) Установка модуля (в папке `server`)
```
npm i better-sqlite3
```

3) Настройка окружения
   - Скопируйте `.env.sample` → `.env`
   - Установите переменные:
```
USE_SQLITE=1
DB_FILE=./data/draft.db
```

4) Перезапустите сервер

5) Проверка
   - Создайте комнату и сделайте 1–2 пика (через Swagger UI или клиентскую страницу)
   - Перезапустите сервер
   - Вызовите:
     - `GET /api/draft/rooms` — комната должна отображаться
     - `GET /api/draft/history?roomId=...` — история пиков сохранена
   - В клиенте нажмите кнопки `GET /api/draft/rooms` и `GET /api/draft/history` для наглядного отображения

Примечания
- В dev‑режиме CORS открыт по умолчанию; cookie‑сессии включены. Для продакшна настройте `CORS_ORIGIN` и `SESSION_SECRET`.
- Сессия общего назначения используется и в Socket.IO (userId берётся из сессии для безопасности), поэтому выполняйте Register/Login перед работой с сокетами.

## Примеры запросов (curl)

Регистрация и вход:
```
curl -i -c cookie.txt -H "Content-Type: application/json" \
  -d '{"login":"demo","password":"pass1234","teamName":"Demo Team"}' \
  http://localhost:3001/api/auth/register

curl -i -b cookie.txt -c cookie.txt -H "Content-Type: application/json" \
  -d '{"login":"demo","password":"pass1234"}' \
  http://localhost:3001/api/auth/login
```

Создание комнаты драфта и пик:
```
ROOM_ID="room-$(openssl rand -hex 4)"

curl -i -b cookie.txt -H "Content-Type: application/json" \
  -d '{"roomId":"'"$ROOM_ID"'","pickOrder":["REPLACE_WITH_YOUR_USER_ID"],"timerSec":60}' \
  http://localhost:3001/api/draft/start

curl -i -b cookie.txt -H "Content-Type: application/json" \
  -d '{"roomId":"'"$ROOM_ID"'","playerId":"player-1"}' \
  http://localhost:3001/api/draft/pick
```

Получение состояния:
```
curl -b cookie.txt "http://localhost:3001/api/draft/room?roomId=$ROOM_ID"
```

Примечание по безопасности: установка зависимостей и запуск серверов требуют сетевых запросов/локальных изменений. Запускайте только осознанно.

## Структура репозитория (начало)
```
Docs/                      # Проектная документация (PDF)
server/                    # Серверная часть (Express + Socket.IO)
  src/
    index.ts               # Точка входа (Socket.IO + HTTP)
    app.ts                 # Express-приложение, middleware, Swagger UI
    draft.ts               # DraftRoom/DraftRoomManager, snake + таймер + cap
    draftTimer.ts          # Серверный таймер, автопик и tick-события
    routes/
      auth.ts              # /api/auth/*
      draft.ts             # /api/draft/*
      data.ts              # /api/* (team, players, leaderboard)
    __tests__/             # Vitest + Supertest e2e
  package.json
  tsconfig.json
  openapi.json             # OpenAPI-спецификация
  .env.sample              # Пример конфигурации окружения
README.md
```

## Дорожная карта (MVP → v1)
- MVP:
  - Черновой real-time драфт (snake), таймер (server-driven), REST эндпоинты управления
  - Базовые тесты (healthcheck, draft state)
  - Подготовка docker-compose (Postgres, Redis)
- v1:
  - Схема БД (Postgres), интеграция Redis, роли и права, undo/redo, экспорт результатов
  - Каталог игроков, валидаторы состава, интеграция статистики
  - UI драфт-комнаты (отдельный фронтенд)
