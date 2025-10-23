# Техническая спецификация — Fantasy Draft App (NHL)

**Версия:** 1.0  
**Дата:** 2025-10-20  
**Статус:** Актуально

---

## 1. Архитектура системы

```
Browser (Frontend) ◄──► Node.js Backend (Express + Socket.IO) ◄──► SQLite/JSON
                                    │
                                    ▼
                        DraftTimerManager (фоновый процесс)
```

### Компоненты
- **Backend:** Express.js + Socket.IO + TypeScript
- **Real-time:** DraftTimerManager для таймеров и автопиков
- **Storage:** SQLite (или JSON для MVP)
- **Парсинг:** Python-скрипт для capwages.com

---

## 2. Технологический стек

### Backend
- **Runtime:** Node.js 18+
- **Language:** TypeScript 5.x
- **Framework:** Express 4.x
- **Real-time:** Socket.IO 4.x
- **Validation:** Zod 3.x
- **Database:** SQLite (better-sqlite3) или JSON
- **Security:** bcrypt, helmet, cors, JWT
- **Testing:** Vitest, Supertest

### Frontend (рекомендации)
- **Framework:** React 18+ / Vue 3+
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Real-time:** Socket.IO Client

### Деплой
- **Hosting:** Railway / Render / PythonAnywhere (бесплатный tier)

---

## 3. Структуры данных

### User
```typescript
interface User {
  id: string;              // UUID
  login: string;           // Уникальный
  password_hash: string;   // bcrypt
  team_name: string;
  logo: string;
  created_at: number;
}
```

### Player
```typescript
interface Player {
  id: string;
  first_name: string;
  last_name: string;
  position: 'C' | 'LW' | 'RW' | 'D' | 'G';
  cap_hit: number;         // Зарплата в $
  team: string;            // Команда NHL
  stats: {
    games: number;
    goals: number;
    assists: number;
    points: number;
  };
  drafted_by: string | null;
  draft_week: number | null;
}
```

### Team
```typescript
interface Team {
  team_id: string;
  owner_id: string;
  name: string;
  logo: string;
  players: string[];       // player IDs
  salary_total: number;    // Max 95,500,000
  week: number;
}
```

### DraftState
```typescript
interface DraftState {
  week: number;
  is_active: boolean;
  start_time: string;
  pick_order: string[];
  current_pick: number;
  timer_sec: number;
  timer_started_at?: number;
  timer_remaining_ms?: number;
  paused: boolean;
  history: DraftPick[];
  snake_draft: boolean;
}

interface DraftPick {
  pick_index: number;
  round: number;
  slot: number;
  user_id: string;
  player_id: string;
  timestamp: number;
}
```

---

## 4. REST API

### POST /register
```json
Request: { "login": "string", "password": "string", "team_name": "string", "logo": "string" }
Response: { "user_id": "uuid", "token": "jwt" }
Errors: 400 "Login already exists"
```

### POST /login
```json
Request: { "login": "string", "password": "string" }
Response: { "user_id": "uuid", "token": "jwt" }
Errors: 401 "Invalid credentials"
```

### POST /draft/start
```json
Request: { "room_id": "string", "pick_order": ["user_id"], "timer_sec": 60 }
Response: { "draft_state": {...} }
Auth: Required (admin only)
```

### GET /draft-room?room_id={id}
```json
Response: { "draft_state": {...}, "available_players": [...], "my_team": {...} }
Auth: Required
```

### POST /draft/pick
```json
Request: { "room_id": "string", "player_id": "string" }
Response: { "draft_state": {...}, "team": {...} }
Errors: 400 "Not your turn!", "Player already picked!", "Salary cap exceeded!"
Auth: Required
```

### GET /team?user_id={id}
```json
Response: { "team": {...}, "players": [...] }
Auth: Required
```

### GET /players?drafted=false&position={pos}
```json
Response: { "players": [...] }
```

### GET /leaderboard?week={week}
```json
Response: { "leaderboard": [...] }

### GET /draft/teams?roomId={id}
```json
Response: {
  "roomId": "string",
  "teams": [
    {
      "ownerId": "string",
      "name": "string",
      "logo": "string",
      "salaryTotal": 0,
      "players": ["player_id"],
      "slots": [ { "position": "LW|C|RW|D|G", "playerId": "string | null" } ]
    }
  ]
}
Auth: Required
```
```

---

## 5. WebSocket Events

### Клиент → Сервер

- `draft:join` — `{roomId}`
- `draft:start` — `{roomId, pickOrder, timerSec}`
- `draft:pick` — `{roomId, userId, playerId}`
- `draft:pause` / `draft:resume` — `{roomId}`

Лобби (Lobby):
- `lobby:join` — `{roomId, userId, login}`
- `lobby:ready` — `{roomId, userId, ready}`
- `lobby:addBots` — `{roomId, count}` (admin only)
- `lobby:start` — `{roomId, pickOrder}` (admin only)
- `lobby:kick` — `{roomId, userId}` (admin only)

### Сервер → Клиент

- `connected` — `{ok: true}`
- `draft:state` — полное состояние драфта
- `draft:timer` — `{roomId, timerRemainingMs, activeUserId}` (каждую секунду)
- `draft:autopick` — `{roomId, pickIndex, pick}`
- `draft:error` — `{message}`

Лобби (Lobby):
- `lobby:participants` — `{participants, adminId}`
- `lobby:ready` — `{userId, ready}`
- `lobby:start`
- `lobby:error` — `{message}`
- `lobby:kicked` — `{roomId}`

---

## 6. Ключевые алгоритмы

### Draft Pick
```typescript
function draftPick(userId, playerId, draftState, team, players, SALARY_CAP = 95_500_000) {
  // 1. Проверка очерёдности (snake draft)
  const activeUserId = getActiveUserId(draftState);
  if (activeUserId !== userId) throw new Error('Not your turn!');
  
  // 2. Проверка доступности игрока
  const player = players.get(playerId);
  if (player.drafted_by !== null) throw new Error('Player already picked!');
  
  // 3. Проверка salary cap
  if (team.salary_total + player.cap_hit > SALARY_CAP) {
    throw new Error('Salary cap exceeded!');
  }
  
  // 4. Atomic update
  team.players.push(playerId);
  team.salary_total += player.cap_hit;
  player.drafted_by = userId;
  
  draftState.history.push({ pick_index: draftState.current_pick, user_id: userId, player_id: playerId, ... });
  draftState.current_pick++;
  draftState.timer_started_at = Date.now();
  
  return { team, draftState };
}
```

### Snake Draft: активный пользователь
```typescript
function getActiveUserId(draftState) {
  const orderLen = draftState.pick_order.length;
  const round = Math.floor(draftState.current_pick / orderLen) + 1;
  const slot = draftState.current_pick % orderLen;
  
  // Реверс в чётных раундах
  const isEvenRound = round % 2 === 0;
  const effectiveSlot = draftState.snake_draft && isEvenRound
    ? orderLen - 1 - slot
    : slot;
  
  return draftState.pick_order[effectiveSlot];
}
```

### Автопик (при истечении таймера)
```typescript
function makeAutoPick(draftState, teams, players) {
  const activeUserId = getActiveUserId(draftState);
  const team = teams.get(activeUserId);
  
  // Стратегия: топ по зарплате из доступных
  const availablePlayers = Array.from(players.values())
    .filter(p => p.drafted_by === null)
    .filter(p => team.salary_total + p.cap_hit <= 95_500_000);
  
  availablePlayers.sort((a, b) => b.cap_hit - a.cap_hit);
  
  return draftPick(activeUserId, availablePlayers[0].id, draftState, team, players);
}
```

### Таймер-менеджер
```typescript
class DraftTimerManager {
  private intervalId?: NodeJS.Timeout;
  
  start() {
    this.intervalId = setInterval(() => this.tick(), 1000);
  }
  
  private tick() {
    for (const [roomId, room] of this.draftManager.getRooms()) {
      const state = room.getState();
      if (!state.started || state.paused) continue;
      
      // Отправить tick
      this.io.to(roomId).emit('draft:timer', { roomId, timerRemainingMs: state.timerRemainingMs, ... });
      
      // Проверить истечение
      if (room.isTimerExpired()) {
        const newState = room.makeAutoPick();
        this.io.to(roomId).emit('draft:state', newState);
        this.io.to(roomId).emit('draft:autopick', { roomId, pick: newState.picks[newState.picks.length - 1] });
      }
    }
  }
}
```

---

## 7. Парсинг capwages.com (Python)

```python
import requests
from bs4 import BeautifulSoup
import json

def fetch_nhl_salaries(output_file="players.json"):
    url = "https://capwages.com/"
    response = requests.get(url)
    soup = BeautifulSoup(response.text, "html.parser")
    
    players = []
    table = soup.find("table", {"id": "player-salaries"})
    rows = table.find_all("tr")[1:]
    
    for row in rows:
        cells = row.find_all("td")
        player = {
            "id": f"player-{len(players)}",
            "first_name": cells[0].text.strip(),
            "last_name": cells[1].text.strip(),
            "position": cells[2].text.strip(),
            "cap_hit": int(cells[3].text.replace("$", "").replace(",", "")),
            "team": cells[4].text.strip(),
            "stats": {"games": 0, "goals": 0, "assists": 0, "points": 0},
            "drafted_by": None,
            "draft_week": None,
        }
        players.append(player)
    
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(players, f, ensure_ascii=False, indent=2)
    
    return players
```

**Запуск:** `python parser.py` → `players.json`

---

## 8. База данных (SQLite)

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  login TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  team_name TEXT NOT NULL,
  logo TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE players (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  position TEXT CHECK(position IN ('C', 'LW', 'RW', 'D', 'G')),
  cap_hit INTEGER NOT NULL,
  team TEXT NOT NULL,
  stats_games INTEGER DEFAULT 0,
  stats_goals INTEGER DEFAULT 0,
  stats_assists INTEGER DEFAULT 0,
  stats_points INTEGER DEFAULT 0,
  drafted_by TEXT REFERENCES users(id),
  draft_week INTEGER
);

CREATE TABLE teams (
  team_id TEXT PRIMARY KEY,
  owner_id TEXT REFERENCES users(id),
  name TEXT NOT NULL,
  logo TEXT NOT NULL,
  salary_total INTEGER NOT NULL DEFAULT 0 CHECK(salary_total <= 95500000),
  week INTEGER NOT NULL
);

CREATE TABLE draft_picks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week INTEGER NOT NULL,
  pick_index INTEGER NOT NULL,
  round INTEGER NOT NULL,
  user_id TEXT REFERENCES users(id),
  player_id TEXT REFERENCES players(id),
  timestamp INTEGER NOT NULL
);
```

**Альтернатива:** JSON-файлы (`data/users.json`, `data/players.json`, ...)

---

## 9. Безопасность

### Хэширование паролей (bcrypt)
```typescript
import bcrypt from 'bcrypt';

const hashPassword = (password: string) => bcrypt.hash(password, 10);
const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);
```

### Авторизация и сессии
В дев-режиме используется cookie-сессия (express-session), общий middleware применяется и для Socket.IO — userId берётся из сессии. Проверка ролей (RBAC) выполняется на сервере для всех админ‑методов (draft:pause/resume — только глобальный админ; lobby:addBots/start/kick — админ лобби или глобальный админ). Вмешательство в логику драфта (force-pick/undo) не поддерживается по требованиям.

JWT может быть применён в будущем, пример ниже приведён как альтернатива.

### JWT для авторизации
```typescript
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'change-in-production';

const generateToken = (userId: string) => jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
const verifyToken = (token: string) => jwt.verify(token, JWT_SECRET) as { userId: string };
```

### Middleware
```typescript
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.substring(7); // "Bearer {token}"
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  
  try {
    const { userId } = verifyToken(token);
    req.userId = userId;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
```

---

## 10. Тестирование

### Unit тесты (Vitest)
```typescript
import { describe, it, expect } from 'vitest';

describe('DraftRoom', () => {
  it('validates salary cap', () => {
    const room = new DraftRoom({ roomId: 'test', pickOrder: ['u1'], timerSec: 60 });
    room.start();
    
    expect(() => room.makePick('u1', 'expensive-player')).toThrow('Salary cap exceeded!');
  });
  
  it('snake draft reverses in even rounds', () => {
    // ... см. src/__tests__/draft.test.ts
  });
});
```

### E2E тесты (Socket.IO)
```typescript
import { io as Client } from 'socket.io-client';

it('draft start and pick flow', async () => {
  const client = Client(`http://localhost:${port}`);
  
  client.emit('draft:start', { roomId: 'room-1', pickOrder: ['u1', 'u2'], timerSec: 60 });
  const state = await waitForEvent(client, 'draft:state');
  
  expect(state.started).toBe(true);
  expect(state.activeUserId).toBe('u1');
  
  client.emit('draft:pick', { roomId: 'room-1', userId: 'u1', playerId: 'p1' });
  const state2 = await waitForEvent(client, 'draft:state');
  
  expect(state2.pickIndex).toBe(1);
  expect(state2.activeUserId).toBe('u2');
});
```

---

## 11. Деплой

### Railway / Render
```yaml
# railway.toml / render.yaml
[build]
  command = "cd server && npm install && npm run build"

[start]
  command = "cd server && npm start"

[env]
  PORT = "3001"
  JWT_SECRET = "random-secret"
  NODE_ENV = "production"
```

### API документация и окружение (для интеграции фронтенда)

- OpenAPI JSON: `GET /api/openapi.json`
- Swagger UI: `GET /api/docs`

Переменные окружения (.env):
- `PORT` — порт HTTP сервера (по умолчанию 3001)
- `SESSION_SECRET` — секрет для cookie-сессий (измените в продакшне)
- `CORS_ORIGIN` — список разрешённых Origins (через запятую). Если пусто — разрешены все Origins (режим разработки)
- `TIMER_SEC` — дефолтное значение таймера (сек), может переопределяться на уровне комнаты

Безопасность:
- В продакшне включить `cookie.secure = true` (HTTPS)
- Задать строгое значение `CORS_ORIGIN` (список доменов фронтенда)
- Ограничить rate-limit на /api/auth/* и /api/draft/* (планируется post-MVP)

---

## 12. Дальнейшие улучшения (post-MVP)

- Frontend UI (React/Vue)
- PostgreSQL вместо SQLite
- Redis для кэша и сессий
- Docker для деплоя
- Ручная корректировка составов (админ)
- Экспорт результатов (CSV/Excel)
- Чат между участниками
- Мобильное приложение (PWA)

```
fantasy-draft-app/
├── server/
│   ├── src/
│   │   ├── index.ts
│   │   ├── app.ts
│   │   ├── draft.ts
│   │   ├── draftTimer.ts
│   │   └── __tests__/
│   ├── data/
│   │   └── players.json
│   ├── package.json
│   └── tsconfig.json
├── parser/
│   └── parser.py
├── REQUIREMENTS.md
├── TECHNICAL_SPEC.md
└── README.md
```

---

## 12. Дальнейшие улучшения (post-MVP)

- Frontend UI (React/Vue)
- PostgreSQL вместо SQLite
- Redis для кэша и сессий
- Docker для деплоя
- Ручная корректировка составов (админ)
- Экспорт результатов (CSV/Excel)
- Чат между участниками
- Мобильное приложение (PWA)
