# NHL API Integration Status — Fantasy Draft App

**Версия:** 1.0  
**Дата:** 2025-10-23  
**Статус:** Частично реализовано

---

## ✅ Что реализовано

### 1. Мультипозиции (eligiblePositions)

**Статус:** ✅ Работает

**Реализация:**
- Player model содержит `eligiblePositions: string[]`
- Валидация пика проверяет: `player.eligiblePositions.includes(slot.position)`
- UI отображает все позиции через "/" (например: "C / LW")

**Пример:**
```typescript
const player = {
  id: "player-1",
  firstName: "Connor",
  lastName: "McDavid",
  eligiblePositions: ["C", "LW"],  // Может играть Center или Left Wing
  capHit: 12500000,
  // ...
};

// При пике на слот LW:
const slot = team.slots.find(s => s.position === "LW" && s.playerId === null);
if (player.eligiblePositions.includes("LW")) {
  // ✅ Pick allowed
}
```

### 2. Данные игроков

**Статус:** ✅ Mock данные (20 игроков)

**Источник:** `server/data/players.json`

**Структура:**
```json
{
  "id": "player-1",
  "firstName": "Connor",
  "lastName": "McDavid",
  "eligiblePositions": ["C"],
  "capHit": 12500000,
  "nhlTeam": "EDM",
  "stats": {
    "games": 82,
    "goals": 32,
    "assists": 68,
    "points": 100
  }
}
```

---

## ⚠️ Что НЕ реализовано (Roadmap)

### 1. Cron-джоба обновления игроков

**Цель:** Обновлять данные игроков каждые 3 часа из NHL API

**План реализации (v1.0):**

```typescript
// server/src/services/nhlApiSync.ts
import cron from 'node-cron';
import { fetchPlayersFromNHLAPI } from './nhlApiClient';

// Запуск каждые 3 часа (0 */3 * * *)
cron.schedule('0 */3 * * *', async () => {
  console.log('[NHL API Sync] Starting player data update...');
  
  try {
    const players = await fetchPlayersFromNHLAPI();
    
    // Обновление БД
    for (const player of players) {
      await db.updatePlayer({
        id: player.id,
        eligiblePositions: player.eligiblePositions,
        capHit: player.capHit,
        stats: player.stats,
        injuryStatus: player.injuryStatus,
      });
    }
    
    console.log(`[NHL API Sync] Updated ${players.length} players`);
  } catch (err) {
    console.error('[NHL API Sync] Failed:', err);
    // Fallback: продолжаем с кешированными данными
  }
});
```

**Зависимости:**
- `node-cron` для планировщика
- NHL API client с retry logic
- Fallback на кешированные данные при сбое

### 2. Полная база NHL игроков

**Текущее состояние:** 20 mock игроков  
**Цель:** ~700 реальных игроков NHL

**План (v1.0):**
1. Парсинг всех команд NHL через API
2. Получение roster для каждой команды
3. Парсинг eligiblePositions, capHit, stats для каждого игрока
4. Сохранение в БД с индексами

**Пример NHL API запроса:**
```bash
# Все команды
GET https://api-web.nhle.com/v1/standings/now

# Roster команды
GET https://api-web.nhle.com/v1/roster/{team}/current

# Детали игрока
GET https://api-web.nhle.com/v1/player/{playerId}/landing
```

### 3. Injury Status

**Цель:** Отображать травмированных игроков с warning

**План (v1.0):**
```typescript
interface Player {
  // ...
  injuryStatus?: {
    injured: boolean;
    description: string;  // "Upper Body", "Day-to-Day"
    expectedReturn?: string;  // "2025-10-30"
  };
}
```

**UI индикатор:**
```tsx
{player.injuryStatus?.injured && (
  <div className="injury-warning">
    ⚠️ {player.injuryStatus.description}
  </div>
)}
```

### 4. Детализированная скоринговая система

**Текущее состояние:** Только базовые stats (games, goals, assists, points)

**Цель:** 17 метрик для skaters, 7 для goalies (см. REQUIREMENTS-updated.md)

**План (v1.0):**
- Расширить Player.stats с полными метриками
- Реализовать подсчёт очков по формуле
- Еженедельные leaderboards с аккумуляцией

---

## 🔧 Технические детали

### NHL API Endpoints (документированные)

| Endpoint | Описание | Использование |
|----------|----------|---------------|
| `/v1/standings/now` | Текущие команды NHL | Получение списка команд |
| `/v1/roster/{team}/current` | Roster команды | Список игроков команды |
| `/v1/player/{id}/landing` | Детали игрока | Stats, eligiblePositions, capHit |
| `/v1/schedule/{team}/week/now` | Расписание команды | Проверка травм, отсутствий |

### Rate Limiting

**NHL API ограничения:**
- Нет официальных лимитов (неофициальный API)
- Рекомендация: не более 60 req/min
- При превышении: HTTP 429 (Too Many Requests)

**Решение:**
- Использовать batch-запросы (по 10 игроков)
- Delay между запросами (1-2 сек)
- Кэширование результатов (Redis или in-memory)

### Fallback Strategy

**При сбое NHL API:**
1. Retry 3 раза с exponential backoff
2. Fallback на кешированные данные (последнее успешное обновление)
3. Логирование ошибки для admin dashboard
4. Уведомление админа (email/webhook)

---

## 📊 Пример полного цикла обновления

```mermaid
graph TD
    A[Cron: каждые 3 часа] --> B[Fetch NHL Teams]
    B --> C[For each team: Fetch Roster]
    C --> D[For each player: Fetch Details]
    D --> E{API Success?}
    E -->|Yes| F[Update DB]
    E -->|No| G[Retry 3x]
    G -->|Still fails| H[Use cached data]
    F --> I[Broadcast update to clients]
    H --> J[Log error + notify admin]
```

---

## 🎯 Acceptance Criteria (для v1.0)

**Считается готовым когда:**

1. ✅ Cron-джоба запускается каждые 3 часа
2. ✅ Все ~700 игроков NHL загружены в БД
3. ✅ eligiblePositions парсятся корректно (тесты проходят)
4. ✅ Injury status отображается в UI с warning
5. ✅ При сбое API используются кешированные данные
6. ✅ Логирование всех sync-операций (Winston)
7. ✅ Unit-тесты на fallback logic (минимум 5 тестов)

---

## 📚 Ссылки

- **NHL API (неофициальный):** https://github.com/dword4/nhlapi
- **ESPN NHL API:** https://www.espn.com/nhl/stats/player
- **CapFriendly (salary cap):** https://www.capfriendly.com/

---

**Последнее обновление:** 23.10.2025  
**Следующий milestone:** v1.0 (NHL API integration)
