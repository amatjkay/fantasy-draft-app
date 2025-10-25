# 🚀 План улучшений Fantasy Draft App

**Дата:** 24.10.2025  
**Версия:** 1.0  
**Статус:** Roadmap для v1.0 и v2.0

---

## 📊 Текущее состояние (MVP → v1.0)

### ✅ Завершено (24.10.2025)

| Категория | Задача | Статус | Файлы |
|-----------|--------|--------|-------|
| **Observability** | Structured logging + file output + rotation | ✅ Готово | `server/src/utils/logger.ts` |
| **Observability** | Health checks (4 endpoints) | ✅ Готово | `server/src/routes/health.ts` |
| **Security** | Rate limiting (API, picks, auth) | ✅ Готово | `server/src/middleware/rateLimiter.ts` |
| **Security** | CSRF protection | ✅ Готово | `server/src/middleware/csrf.ts` |
| **Security** | Input sanitization | ✅ Готово | `server/src/middleware/sanitize.ts` |
| **Requirements** | Non-Functional Requirements (NFR) | ✅ Готово | `REQUIREMENTS.md` §11 |

### ⚠️ Требует тестирования

| Задача | Действие | Приоритет |
|--------|----------|-----------|
| **Security middleware integration** | Проверить корректность работы rate limiting, CSRF, sanitization | 🔴 CRITICAL |
| **Build process** | `cd server && npm run build` должен пройти успешно | 🔴 CRITICAL |
| **E2E tests** | Все 18 тестов должны пройти с новыми middleware | 🔴 CRITICAL |
| **Health checks** | Проверить доступность `/health`, `/health/ready`, `/health/live`, `/health/metrics` | 🟡 HIGH |

---

## 🎯 Фаза 1: Production Readiness (Осталось 3-5 дней)

### 1.1 Testing & Validation (2-3 дня) 🔴

#### **Security Testing**
```bash
# 1. Rate limiting test
for i in {1..110}; do curl http://localhost:3001/api/rooms; done
# Ожидаем: 429 после 100 запросов

# 2. CSRF test
curl -X POST http://localhost:3001/api/draft/pick -d '{"playerId":"p1"}'
# Ожидаем: 403 CSRF token required

# 3. XSS test
curl -X POST http://localhost:3001/api/auth/register \
  -d '{"login":"<script>alert(1)</script>","password":"pass123","teamName":"Test"}'
# Ожидаем: HTML escape в ответе
```

**Создать файл:** `server/src/__tests__/security.test.ts`
```typescript
describe('Security', () => {
  it('should block after rate limit exceeded', async () => {
    for (let i = 0; i < 100; i++) {
      await request(app).get('/api/rooms');
    }
    const res = await request(app).get('/api/rooms');
    expect(res.status).toBe(429);
  });

  it('should require CSRF token for POST requests', async () => {
    const res = await request(app)
      .post('/api/rooms/test/pick')
      .send({ playerId: 'p1' });
    expect(res.status).toBe(403);
  });

  it('should sanitize XSS attempts', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        login: '<script>alert("xss")</script>',
        password: 'pass123',
        teamName: 'Test',
      });
    // Should escape HTML entities
    expect(res.body.login).not.toContain('<script>');
  });
});
```

#### **Build & E2E Tests**
```bash
# 1. Server build
cd server
npm run build
# Ожидаем: success без ошибок

# 2. Run E2E tests
cd ..
npx playwright test
# Ожидаем: все 18 тестов проходят
```

**Если тесты падают:**
- Проверить, не блокирует ли rate limiting e2e тесты
- Возможно нужно добавить `SKIP_RATE_LIMIT=1` для тестов

### 1.2 Frontend Integration (1-2 дня) 🟡

#### **CSRF Token Integration**

**Обновить:** `client/src/App.tsx`
```typescript
// Получить CSRF token при инициализации
const [csrfToken, setCsrfToken] = useState('');

useEffect(() => {
  fetch('/api/csrf-token', { credentials: 'include' })
    .then(r => r.json())
    .then(data => setCsrfToken(data.csrfToken));
}, []);

// Включать token во все POST/PUT/DELETE запросы
const makePick = async () => {
  await fetch('/api/draft/pick', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken, // ← ВАЖНО
    },
    body: JSON.stringify({ roomId, userId, playerId }),
  });
};
```

#### **User-Friendly Error Messages**

**Создать:** `client/src/utils/errorMessages.ts`
```typescript
export function formatError(error: any): string {
  // Rate limit errors
  if (error.status === 429) {
    return `Превышен лимит запросов. Попробуйте через ${error.retryAfter || 60} секунд.`;
  }
  
  // CSRF errors
  if (error.code === 'CSRF_TOKEN_INVALID') {
    return 'Сессия устарела. Обновите страницу.';
  }
  
  // Default
  return error.message || 'Произошла ошибка. Попробуйте снова.';
}
```

### 1.3 Deployment Configuration (1 день) 🟢

#### **Environment Variables**

**Создать:** `server/.env.production`
```env
# Server
NODE_ENV=production
PORT=3001

# Session
SESSION_SECRET=<генерировать 64-символьный random string>

# Database
USE_SQLITE=1
DB_FILE=./data/draft.db

# CORS
CORS_ORIGIN=https://your-domain.com

# Logging
ENABLE_FILE_LOGGING=1
LOG_LEVEL=info
LOG_DIR=./logs

# Security
SKIP_CSRF=0
SKIP_RATE_LIMIT=0

# Timer
TIMER_SEC=60
RECONNECT_GRACE_SEC=60
```

#### **PM2 Ecosystem**

**Создать:** `ecosystem.config.js`
```javascript
module.exports = {
  apps: [{
    name: 'fantasy-draft-server',
    script: 'server/dist/index.js',
    instances: 1,
    exec_mode: 'fork',
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001,
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    restart_delay: 4000,
    max_restarts: 10,
    min_uptime: '10s',
  }]
};
```

**Deploy commands:**
```bash
# Build
cd server && npm run build

# Start with PM2
pm2 start ecosystem.config.js --env production

# Monitor
pm2 status
pm2 logs
pm2 monit
```

---

## 🔮 Фаза 2: Scalability (v2.0 - Backlog)

### 2.1 PostgreSQL Migration (5-7 дней)

**Зачем:** SQLite ограничен single writer lock → max 100 concurrent users

**Шаги:**
1. Установить PostgreSQL (локально или cloud: Neon, Supabase)
2. Создать `server/src/persistence/postgresRepository.ts`
3. Миграция schema (users, teams, draft_rooms, picks)
4. Dual-write period (SQLite + PostgreSQL параллельно)
5. Switch to PostgreSQL
6. Удалить SQLite код

**Пример:**
```typescript
// server/src/persistence/postgresRepository.ts
import { Pool } from 'pg';

export class PostgresDraftRepository implements IDraftRoomRepository {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20, // connection pool
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }

  async save(room: DraftRoom): Promise<void> {
    await this.pool.query(
      `INSERT INTO draft_rooms (id, state, updated_at) 
       VALUES ($1, $2, NOW())
       ON CONFLICT (id) DO UPDATE 
       SET state = $2, updated_at = NOW()`,
      [room.id, JSON.stringify(room)]
    );
  }
}
```

### 2.2 Redis Session Store (2-3 дня)

**Зачем:** In-memory sessions теряются при restart сервера

**Шаги:**
1. Активировать `server/src/adapters/redis-session.ts` (раскомментировать)
2. Установить Redis (локально или cloud: Upstash free tier)
3. Set ENV: `USE_REDIS_SESSION=1`, `REDIS_URL=redis://localhost:6379`
4. Тестирование: restart сервера, сессия сохраняется

### 2.3 Node.js Clustering (3 дня)

**Зачем:** Использовать все CPU cores для >500 concurrent users

**Шаги:**
1. Активировать `server/src/adapters/redis-socket.ts` (Socket.IO Redis adapter)
2. Создать `server/src/cluster.ts`:
```typescript
import cluster from 'cluster';
import os from 'os';

if (cluster.isPrimary) {
  const numCPUs = os.cpus().length;
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  
  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died. Restarting...`);
    cluster.fork();
  });
} else {
  require('./index');
}
```
3. Обновить PM2 config: `exec_mode: 'cluster', instances: 4`

### 2.4 Monitoring & Alerting (2-3 дня)

#### **Prometheus Metrics**

**Создать:** `server/src/metrics/prometheus.ts`
```typescript
import promClient from 'prom-client';

const register = new promClient.Registry();

export const pickDuration = new promClient.Histogram({
  name: 'draft_pick_duration_ms',
  help: 'Duration of draft pick operation',
  labelNames: ['roomId', 'status'],
  buckets: [50, 100, 200, 500, 1000],
});

register.registerMetric(pickDuration);

// Endpoint
app.get('/metrics', async (req, res) => {
  res.setHeader('Content-Type', register.contentType);
  res.send(await register.metrics());
});
```

#### **Grafana Dashboard**

1. Установить Prometheus + Grafana (Docker)
2. Configure Prometheus scrape target: `http://localhost:3001/metrics`
3. Создать Grafana dashboard:
   - Draft metrics: active rooms, picks/min, autopick rate
   - Performance: p50/p95/p99 latency
   - Errors: error rate by type
   - System: CPU, memory, connections

#### **Alerting Rules**

```yaml
# prometheus/alerts.yml
groups:
  - name: draft_alerts
    rules:
      - alert: HighErrorRate
        expr: rate(draft_pick_errors_total[5m]) > 0.05
        for: 5m
        annotations:
          summary: "High pick error rate: {{ $value }}"
      
      - alert: HighLatency
        expr: histogram_quantile(0.95, draft_pick_duration_ms) > 500
        for: 5m
        annotations:
          summary: "p95 latency > 500ms"
```

---

## 📚 Фаза 3: Code Quality (v2.0 - Nice to Have)

### 3.1 Frontend Refactoring (3-4 дня)

**Проблема:** App.tsx = 452 строки монолит

**Решение:** Custom hooks + feature modules

```
client/src/
  hooks/
    useSocket.ts       ← Socket.IO logic
    useAuth.ts         ← Auth logic
    useDraft.ts        ← Draft state + actions
    useApi.ts          ← REST API wrapper
  features/
    auth/
      LoginPage.tsx
      RegisterForm.tsx
    lobby/
      LobbyView.tsx
      ParticipantsList.tsx
    draft/
      DraftView.tsx
      PlayerList.tsx
      TeamRoster.tsx
```

### 3.2 Shared Types Package (1-2 дня)

**Проблема:** Дублирование типов между client/server

**Решение:** Monorepo с shared package

```
packages/
  shared/
    src/
      types.ts       ← User, DraftRoom, Player
      events.ts      ← Socket.IO event types
      validation.ts  ← Zod schemas
    package.json
  client/
  server/
pnpm-workspace.yaml
```

### 3.3 Event Sourcing (Опционально, 5-7 дней)

**Проблема:** SQLite write lock при параллельных picks

**Решение:** Append-only event log

```typescript
interface DraftEvent {
  id: string;
  roomId: string;
  type: 'PICK' | 'PAUSE' | 'RESUME';
  payload: any;
  timestamp: number;
}

// Fast append (no lock contention)
db.prepare('INSERT INTO draft_events VALUES (?, ?, ?, ?, ?)')
  .run(event.id, event.roomId, event.type, JSON.stringify(event.payload), event.timestamp);

// Replay for state reconstruction
const events = db.prepare('SELECT * FROM draft_events WHERE roomId = ? ORDER BY timestamp').all(roomId);
const currentState = events.reduce((state, event) => applyEvent(state, event), initialState);
```

---

## ✅ Acceptance Criteria для v1.0 Release

**Production-ready ТОЛЬКО если выполнены ВСЕ критерии:**

### Security (обязательно)
- [ ] Rate limiting активен и протестирован (429 после лимита)
- [ ] CSRF protection работает (403 без токена)
- [ ] Input sanitization покрывает 100% user inputs
- [ ] Security tests проходят (`server/src/__tests__/security.test.ts`)
- [ ] OWASP Top 10 checklist пройден

### Observability (обязательно)
- [ ] Structured logs пишутся в файлы с rotation
- [ ] Health checks доступны и работают
- [ ] Логи содержат достаточно context (roomId, userId, playerId)

### Testing (обязательно)
- [ ] Все unit/integration тесты проходят
- [ ] Все 18 E2E тестов проходят с новыми middleware
- [ ] Load testing: 50 concurrent users без деградации
- [ ] Server build успешен (`npm run build`)

### Documentation (обязательно)
- [ ] API documentation актуальна
- [ ] Deployment guide обновлён (с новыми ENV vars)
- [ ] REQUIREMENTS.md содержит NFR (§11)

### Performance (обязательно)
- [ ] p95 latency <200ms для draft:pick
- [ ] No data loss под нагрузкой
- [ ] Graceful shutdown работает

---

## 🎯 Следующие шаги (Immediate Actions)

### День 1-2: Тестирование
1. ✅ Собрать server: `cd server && npm run build`
2. ✅ Запустить server: `npm run dev`
3. ✅ Проверить health checks:
   - `curl http://localhost:3001/health`
   - `curl http://localhost:3001/health/ready`
4. ✅ Проверить CSRF endpoint: `curl http://localhost:3001/api/csrf-token`
5. ✅ Запустить E2E: `npx playwright test`
6. ⚠️ Исправить падающие тесты (если есть)

### День 3: Frontend Integration
1. Добавить CSRF token в App.tsx
2. Обновить error handling для rate limiting
3. Тестировать UI с новыми middleware

### День 4-5: Production Prep
1. Создать production .env
2. Setup PM2 ecosystem
3. Load testing (k6 или artillery)
4. Security audit

---

## 📞 Контакты и ресурсы

**Документация:**
- REQUIREMENTS.md §11 (NFR)
- TECHNICAL_SPEC.md
- README.md

**Security:**
- OWASP Top 10: https://owasp.org/www-project-top-ten/
- Express Security Best Practices: https://expressjs.com/en/advanced/best-practice-security.html

**Monitoring:**
- Prometheus: https://prometheus.io/docs/introduction/overview/
- Grafana: https://grafana.com/docs/

---

**Документ обновлён:** 24.10.2025  
**Следующий review:** После завершения Phase 1 (Testing & Validation)
