# Техническая спецификация — Fantasy Draft App (NHL)

**Версия:** 2.0  
**Дата:** 2025-10-23  
**Статус:** Актуально (обновлено после технического аудита)

---

## 1. Архитектура системы

```
Browser (React + Socket.IO Client)
        ↕ HTTP/WebSocket
Node.js Backend (Express + Socket.IO)
        ↕ Shared Session Middleware
        ↕
SQLite / In-Memory Storage
        ↕
DraftTimerManager (Background Process)
```

### Ключевые компоненты

| Компонент | Технология | Назначение |
|-----------|-----------|-----------|
| **Backend** | Express.js + TypeScript | REST API endpoints |
| **Real-time** | Socket.IO 4.x | WebSocket для драфта |
| **Storage** | SQLite (better-sqlite3) | Персистентность (опционально) |
| **Timer** | DraftTimerManager | Server-driven таймер + автопик |
| **Session** | express-session | Общий для REST + Socket.IO |
| **Validation** | Zod 3.x | Runtime schema validation |

---

## 2. Технологический стек

### Backend (Production-Ready)

```json
{
  "runtime": "Node.js 20 LTS",
  "language": "TypeScript 5.x",
  "framework": "Express 4.x",
  "realtime": "Socket.IO 4.x",
  "validation": "Zod 3.x",
  "database": "SQLite (better-sqlite3)",
  "auth": "express-session + bcrypt",
  "security": "helmet, cors",
  "testing": "Vitest + Supertest + Playwright"
}
```

### Frontend

```json
{
  "framework": "React 18",
  "language": "TypeScript",
  "build": "Vite",
  "styling": "CSS Modules + Dark Theme",
  "realtime": "Socket.IO Client"
}
```

### Деплой (рекомендации)

- **Бесплатный tier:** Railway / Render / Fly.io
- **Production:** VPS (Ubuntu 22.04) + nginx + PM2
- **Database:** SQLite достаточно для 50-100 concurrent users

---

## 3. Структуры данных

### 3.1 User

```typescript
interface User {
  id: string;                // UUID v4
  login: string;             // Unique, alphanumeric
  passwordHash: string;      // bcrypt (10 rounds)
  teamName: string;          // Max 50 chars
  logo: string;              // Team logo identifier
  role: 'admin' | 'user';    // RBAC role
  createdAt: number;         // Unix timestamp
}
```

**Zod Schema:**
```typescript
const UserSchema = z.object({
  id: z.string().uuid(),
  login: z.string().min(3).max(20),
  passwordHash: z.string(),
  teamName: z.string().min(1).max(50),
  logo: z.string(),
  role: z.enum(['admin', 'user']),
  createdAt: z.number(),
});
```

### 3.2 Player

```typescript
interface Player {
  id: string;
  firstName: string;
  lastName: string;
  eligiblePositions: ('C' | 'LW' | 'RW' | 'D' | 'G')[];  // Multi-position support
  capHit: number;            // Salary in $
  nhlTeam: string;           // NHL team abbreviation
  stats: {
    games: number;
    goals: number;
    assists: number;
    points: number;
  };
  draftedBy: string | null;  // userId or null
  draftWeek: number | null;
}
```

**Ключевые особенности:**
- `eligiblePositions` — массив позиций (например, игрок может быть C/LW)
- Игрок может занять **только один** слот в ростере
- `capHit` — зарплата игрока по Salary Cap ($95M)

### 3.3 Team

```typescript
interface Team {
  userId: string;
  teamName: string;
  logo: string;
  players: string[];         // Array of player IDs
  slots: Slot[];             // 6 позиций: LW, C, RW, D, D, G
  salaryTotal: number;       // Max 95,500,000
  week: number;
}

interface Slot {
  position: 'LW' | 'C' | 'RW' | 'D' | 'G';
  playerId: string | null;
}
```

### 3.4 DraftState

```typescript
interface DraftState {
  roomId: string;
  started: boolean;
  completed: boolean;
  paused: boolean;
  pickOrder: string[];       // Array of user IDs
  pickIndex: number;         // Current pick index (0-based)
  numRounds: number;         // Default: 6
  timerSec: number;          // Default: 60
  timerStartedAt: number | null;
  activeUserId: string | null;
  picks: DraftPick[];
  snakeDraft: boolean;       // true = reverse in even rounds
}

interface DraftPick {
  pickIndex: number;
  round: number;
  slot: number;
  userId: string;
  playerId: string;
  timestamp: number;
  auto: boolean;             // true if autopick
}
```

---

## 4. REST API

### 4.1 Authentication (`/api/auth`)

#### POST /api/auth/register
**Request:**
```json
{
  "login": "string",        // min 3, max 20 chars
  "password": "string",     // min 6 chars
  "teamName": "string"      // max 50 chars
}
```

**Response (200):**
```json
{
  "userId": "uuid",
  "teamName": "string"
}
```

**Errors:**
- `400` — "Login already exists"
- `400` — "Validation error" (Zod validation)

#### POST /api/auth/login
**Request:**
```json
{
  "login": "string",
  "password": "string"
}
```

**Response (200):**
```json
{
  "userId": "uuid",
  "teamName": "string"
}
```

**Errors:**
- `401` — "Invalid credentials"

#### POST /api/auth/logout
**Response (200):**
```json
{
  "ok": true
}
```

### 4.2 Draft Management (`/api/draft`)

#### POST /api/draft/start
**Auth:** Required (admin only)

**Request:**
```json
{
  "roomId": "string",
  "pickOrder": ["userId1", "userId2"],  // Min 2 users
  "timerSec": 60                        // Default: 60
}
```

**Response (200):**
```json
{
  "draft": { /* DraftState */ }
}
```

#### GET /api/draft/room
**Auth:** Required

**Query Params:**
- `roomId` (required)

**Response (200):**
```json
{
  "draft": { /* DraftState */ },
  "myTeam": { /* Team */ },
  "availablePlayers": [ /* Player[] */ ]
}
```

#### POST /api/draft/pick
**Auth:** Required

**Request:**
```json
{
  "roomId": "string",
  "playerId": "string"
}
```

**Response (200):**
```json
{
  "draft": { /* DraftState */ },
  "team": { /* Team */ }
}
```

**Errors:**
- `400` — "Not your turn!"
- `400` — "Player already picked!"
- `400` — "Salary cap exceeded!"
- `400` — "No free slot for this position!"

#### GET /api/draft/teams
**Auth:** Required

**Query Params:**
- `roomId` (required)

**Response (200):**
```json
{
  "roomId": "string",
  "teams": [
    {
      "ownerId": "string",
      "name": "string",
      "logo": "string",
      "salaryTotal": 25000000,
      "players": ["player-1", "player-2"],
      "slots": [
        { "position": "LW", "playerId": null },
        { "position": "C", "playerId": "player-1" }
      ]
    }
  ]
}
```

### 4.3 Data (`/api/data`)

#### GET /api/data/team
**Auth:** Required

**Query Params:**
- `userId` (optional, default: current user)

**Response (200):**
```json
{
  "team": { /* Team */ },
  "picks": [ /* Player[] with full objects */ ]
}
```

#### GET /api/data/players
**Query Params:**
- `drafted` (optional): "true" | "false"
- `position` (optional): "C" | "LW" | "RW" | "D" | "G"

**Response (200):**
```json
{
  "players": [ /* Player[] */ ]
}
```

#### GET /api/data/leaderboard
**Query Params:**
- `week` (optional): number

**Response (200):**
```json
{
  "leaderboard": [
    {
      "userId": "string",
      "teamName": "string",
      "totalPoints": 1250,
      "rank": 1
    }
  ]
}
```

---

## 5. WebSocket Events

### 5.1 Lobby Events

**Клиент → Сервер:**

| Event | Payload | Auth | Description |
|-------|---------|------|-------------|
| `lobby:join` | `{roomId, userId, login}` | ✅ | Присоединиться к лобби |
| `lobby:ready` | `{roomId, userId, ready}` | ✅ | Изменить статус готовности |
| `lobby:addBots` | `{roomId, count}` | ✅ Admin | Добавить ботов |
| `lobby:start` | `{roomId, pickOrder}` | ✅ Admin | Запустить драфт |
| `lobby:kick` | `{roomId, userId}` | ✅ Admin | Исключить участника |

**Сервер → Клиент:**

| Event | Payload | Description |
|-------|---------|-------------|
| `lobby:participants` | `{participants, adminId}` | Список участников |
| `lobby:ready` | `{userId, ready}` | Статус готовности изменён |
| `lobby:start` | `{}` | Драфт начался |
| `lobby:error` | `{message}` | Ошибка |
| `lobby:kicked` | `{roomId}` | Вы исключены |

### 5.2 Draft Events

**Клиент → Сервер:**

| Event | Payload | Auth | Description |
|-------|---------|------|-------------|
| `draft:join` | `{roomId}` | ✅ | Подключиться к драфту |
| `draft:pick` | `{roomId, userId, playerId}` | ✅ | Выбрать игрока |
| `draft:pause` | `{roomId}` | ✅ Admin | Пауза |
| `draft:resume` | `{roomId}` | ✅ Admin | Продолжить |

**Сервер → Клиент:**

| Event | Payload | Frequency | Description |
|-------|---------|-----------|-------------|
| `draft:state` | `{draft: DraftState}` | After each pick | Полное состояние |
| `draft:timer` | `{roomId, timerRemainingMs, activeUserId}` | Every 1 sec | Тик таймера |
| `draft:autopick` | `{roomId, pickIndex, pick}` | On autopick | Автопик произошёл |
| `draft:error` | `{message}` | On error | Ошибка |

---

## 6. Ключевые алгоритмы

### 6.1 Draft Pick (с валидацией)

```typescript
function makePick(
  userId: string,
  playerId: string,
  draftState: DraftState,
  team: Team,
  players: Map<string, Player>,
  SALARY_CAP = 95_500_000
): { team: Team; draftState: DraftState } {
  // 1. Проверка очерёдности
  const activeUserId = getActiveUserId(draftState);
  if (activeUserId !== userId) {
    throw new Error('Not your turn!');
  }

  // 2. Проверка доступности игрока
  const player = players.get(playerId);
  if (!player) throw new Error('Player not found!');
  if (player.draftedBy !== null) {
    throw new Error('Player already picked!');
  }

  // 3. Проверка salary cap
  if (team.salaryTotal + player.capHit > SALARY_CAP) {
    throw new Error('Salary cap exceeded!');
  }

  // 4. Проверка свободного слота по позиции
  const freeSlot = team.slots.find(
    s => player.eligiblePositions.includes(s.position) && s.playerId === null
  );
  if (!freeSlot) {
    throw new Error('No free slot for this position!');
  }

  // 5. Atomic update
  freeSlot.playerId = playerId;
  team.players.push(playerId);
  team.salaryTotal += player.capHit;
  player.draftedBy = userId;

  draftState.picks.push({
    pickIndex: draftState.pickIndex,
    round: Math.floor(draftState.pickIndex / draftState.pickOrder.length) + 1,
    slot: draftState.pickIndex % draftState.pickOrder.length,
    userId,
    playerId,
    timestamp: Date.now(),
    auto: false,
  });

  draftState.pickIndex++;
  draftState.timerStartedAt = Date.now();

  // 6. Check if draft completed
  if (draftState.pickIndex >= draftState.pickOrder.length * draftState.numRounds) {
    draftState.completed = true;
    draftState.activeUserId = null;
  } else {
    draftState.activeUserId = getActiveUserId(draftState);
  }

  return { team, draftState };
}
```

### 6.2 Snake Draft (активный пользователь)

```typescript
function getActiveUserId(draftState: DraftState): string {
  const orderLen = draftState.pickOrder.length;
  const round = Math.floor(draftState.pickIndex / orderLen) + 1;
  const slot = draftState.pickIndex % orderLen;

  // Реверс в чётных раундах для snake draft
  const isEvenRound = round % 2 === 0;
  const effectiveSlot =
    draftState.snakeDraft && isEvenRound
      ? orderLen - 1 - slot
      : slot;

  return draftState.pickOrder[effectiveSlot];
}
```

### 6.3 Автопик (с учётом позиций и cap)

```typescript
function makeAutoPick(
  draftState: DraftState,
  teams: Map<string, Team>,
  players: Map<string, Player>
): { team: Team; draftState: DraftState } {
  const activeUserId = getActiveUserId(draftState);
  const team = teams.get(activeUserId)!;

  // Найти свободные позиции
  const freePositions = team.slots
    .filter(s => s.playerId === null)
    .map(s => s.position);

  // Найти доступных игроков (по cap и позициям)
  const availablePlayers = Array.from(players.values())
    .filter(p => p.draftedBy === null)
    .filter(p => team.salaryTotal + p.capHit <= 95_500_000)
    .filter(p => p.eligiblePositions.some(pos => freePositions.includes(pos)));

  if (availablePlayers.length === 0) {
    throw new Error('No available players for autopick!');
  }

  // Сортировка по очкам прошлого сезона (лучший игрок)
  availablePlayers.sort((a, b) => b.stats.points - a.stats.points);

  return makePick(activeUserId, availablePlayers[0].id, draftState, team, players);
}
```

### 6.4 DraftTimerManager (фоновый процесс)

```typescript
class DraftTimerManager {
  private intervalId?: NodeJS.Timeout;
  private io: Server;
  private draftManager: DraftRoomManager;

  constructor(io: Server, draftManager: DraftRoomManager) {
    this.io = io;
    this.draftManager = draftManager;
  }

  start() {
    this.intervalId = setInterval(() => this.tick(), 1000);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  private tick() {
    for (const [roomId, room] of this.draftManager.getRooms()) {
      const state = room.getState();

      // Пропустить неактивные или завершённые драфты
      if (!state.started || state.completed || state.paused) continue;

      // Вычислить оставшееся время
      const elapsed = Date.now() - (state.timerStartedAt || 0);
      const remaining = state.timerSec * 1000 - elapsed;

      // Отправить tick всем в комнате
      this.io.to(roomId).emit('draft:timer', {
        roomId,
        timerRemainingMs: Math.max(0, remaining),
        activeUserId: state.activeUserId,
      });

      // Автопик при истечении времени
      if (remaining <= 0) {
        try {
          const newState = room.makeAutoPick();
          this.io.to(roomId).emit('draft:state', { draft: newState });
          this.io.to(roomId).emit('draft:autopick', {
            roomId,
            pickIndex: newState.pickIndex - 1,
            pick: newState.picks[newState.picks.length - 1],
          });
        } catch (err) {
          console.error(`Autopick failed for room ${roomId}:`, err);
          this.io.to(roomId).emit('draft:error', {
            message: 'Autopick failed! Draft paused.',
          });
          room.pause();
        }
      }
    }
  }
}
```

---

## 7. База данных (SQLite)

### 7.1 Схема

```sql
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  login TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  team_name TEXT NOT NULL,
  logo TEXT NOT NULL,
  role TEXT CHECK(role IN ('admin', 'user')) DEFAULT 'user',
  created_at INTEGER NOT NULL
);

-- Players table
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  eligible_positions TEXT NOT NULL,  -- JSON array: ["C", "LW"]
  cap_hit INTEGER NOT NULL,
  nhl_team TEXT NOT NULL,
  stats_games INTEGER DEFAULT 0,
  stats_goals INTEGER DEFAULT 0,
  stats_assists INTEGER DEFAULT 0,
  stats_points INTEGER DEFAULT 0,
  drafted_by TEXT REFERENCES users(id),
  draft_week INTEGER
);

-- Draft Rooms table
CREATE TABLE IF NOT EXISTS draft_rooms (
  room_id TEXT PRIMARY KEY,
  state TEXT NOT NULL,               -- JSON serialized DraftState
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Draft Picks table (for history)
CREATE TABLE IF NOT EXISTS draft_picks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL,
  pick_index INTEGER NOT NULL,
  round INTEGER NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  player_id TEXT NOT NULL REFERENCES players(id),
  timestamp INTEGER NOT NULL,
  auto BOOLEAN DEFAULT 0,
  UNIQUE(room_id, pick_index)
);

-- Indexes для performance
CREATE INDEX IF NOT EXISTS idx_players_drafted_by ON players(drafted_by);
CREATE INDEX IF NOT EXISTS idx_players_eligible_positions ON players(eligible_positions);
CREATE INDEX IF NOT EXISTS idx_draft_picks_room_id ON draft_picks(room_id);
```

### 7.2 Миграция с SQLite на PostgreSQL (future)

**Причины:**
- SQLite ограничен 1 writer (bottleneck при >100 users)
- PostgreSQL поддерживает MVCC (concurrent writes)
- Встроенная репликация и failover

**Изменения:**
- Типы: `INTEGER` → `BIGINT`, `TEXT` → `VARCHAR(n)` или `JSONB`
- Connection pooling: pgBouncer или `pg.Pool`
- Indexes: добавить GIN index на `eligible_positions` (JSONB array)

---

## 8. Безопасность

### 8.1 Реализовано

✅ **Session-based auth** (express-session + httpOnly cookies)  
✅ **Password hashing** (bcrypt, 10 rounds)  
✅ **CORS** (whitelist для production через `CORS_ORIGIN` env)  
✅ **SQL injection protection** (параметризованные запросы)  
✅ **XSS protection** (React автоматическое экранирование)  
✅ **RBAC** (admin не может force-pick/undo)

### 8.2 В разработке (v1.0)

⚠️ **Rate limiting** (express-rate-limit)
```typescript
import rateLimit from 'express-rate-limit';

const authLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 минута
  max: 5,               // 5 запросов
  message: 'Too many requests, please try again later.',
});

app.use('/api/auth/*', authLimiter);
```

⚠️ **CSRF protection** (csurf middleware)  
⚠️ **Input sanitization** (express-validator)  
⚠️ **Secure headers** (helmet configuration)

---

## 9. Тестирование

### 9.1 Unit + Integration Tests (Vitest)

**Покрытие:**
- REST API: 39 тестов
- Socket.IO: 4 теста
- Unit (business logic): 4 теста
- Persistence: 3 теста

**Запуск:**
```bash
cd server
npm test
```

### 9.2 E2E Tests (Playwright)

**Сценарии:**
- `rbac.spec.ts` — Проверка ограничений админа
- `allteams.spec.ts` — Draft Board (все команды)
- `reconnect.spec.ts` — Reconnect grace period
- `smoke.spec.ts` — Базовый smoke test

**Браузеры:** Chromium, Firefox, WebKit

**Запуск:**
```bash
npx playwright test
```

### 9.3 Пример теста (Snake Draft)

```typescript
import { describe, it, expect } from 'vitest';
import { DraftRoom } from '../draft';

describe('DraftRoom: Snake Draft', () => {
  it('should reverse pick order in even rounds', () => {
    const room = new DraftRoom({
      roomId: 'test',
      pickOrder: ['u1', 'u2', 'u3'],
      timerSec: 60,
      numRounds: 4,
    });

    room.start();

    // Round 1: u1 → u2 → u3
    expect(room.getState().activeUserId).toBe('u1');
    room.makePick('u1', 'p1');
    expect(room.getState().activeUserId).toBe('u2');
    room.makePick('u2', 'p2');
    expect(room.getState().activeUserId).toBe('u3');
    room.makePick('u3', 'p3');

    // Round 2: u3 → u2 → u1 (reversed)
    expect(room.getState().activeUserId).toBe('u3');
    room.makePick('u3', 'p4');
    expect(room.getState().activeUserId).toBe('u2');
    room.makePick('u2', 'p5');
    expect(room.getState().activeUserId).toBe('u1');
  });
});
```

---

## 10. Deployment

### 10.1 Environment Variables

```env
# Server
PORT=3001
NODE_ENV=production

# Session
SESSION_SECRET=<random-64-char-string>

# Database
USE_SQLITE=1
DB_FILE=./data/draft.db

# CORS
CORS_ORIGIN=https://your-domain.com

# Timer
TIMER_SEC=60
RECONNECT_GRACE_SEC=60
```

### 10.2 Production Setup (Railway / Render)

**Build Command:**
```bash
cd server && npm install && npm run build
```

**Start Command:**
```bash
cd server && npm start
```

**Health Check:**
```bash
GET /health
```

### 10.3 Performance Considerations

**Для 50-100 concurrent users:**
- ✅ SQLite достаточно (write lock не критичен)
- ✅ Single Node.js instance (no clustering needed)
- ✅ In-memory session store допустим

**Для 100-500 users:**
- ⚠️ Рассмотреть PostgreSQL
- ⚠️ Redis session store (Upstash Free Tier)
- ⚠️ Node.js clustering (4 workers)

---

## 11. Roadmap (Post-MVP)

### v1.0 (Security & Reliability)
- [ ] Rate limiting
- [ ] CSRF protection
- [ ] Structured logging (Winston)
- [ ] Graceful shutdown
- [ ] Health checks

### v2.0 (Scaling)
- [ ] PostgreSQL migration
- [ ] Redis session store
- [ ] Node.js clustering
- [ ] Load testing (k6)

### v3.0 (Features)
- [ ] Полная база NHL игроков (~700)
- [ ] Детализированная скоринговая система
- [ ] Email уведомления
- [ ] PWA (mobile app)

---

**Документ обновлён:** 23.10.2025  
**Статус:** Production-Ready для 50-100 users
