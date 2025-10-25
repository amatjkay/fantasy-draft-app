# REQUIREMENTS.md — Fantasy Draft App (NHL)

**Версия:** 2.0  
**Дата:** 2025-10-23  
**Статус:** Актуально (обновлено после технического аудита и анализа архитектуры)

---

## 1. Общая концепция

Fantasy Draft App — веб-приложение для проведения еженедельных драфтов по хоккею NHL с поддержкой:
- **Salary cap** ($95,000,000 по правилам NHL)
- **Мультипозиционных игроков** (eligiblePositions через NHL API)
- **Автоматического подсчёта очков** по детализированной скоринговой формуле (17 метрик для skaters, 7 для goalies)
- **Real-time драфта** через WebSocket (Socket.IO)

**Целевая аудитория:** 50-100 участников в одной лиге  
**Модель использования:** Еженедельные драфты с аккумуляцией очков в сезонный рейтинг

---

## 2. Архитектура бизнес-логики

### 2.1 Роли и доступ

#### Администратор лобби/глобальный админ
**Может:**
- Создавать драфт-комнату
- Запускать драфт (`lobby:start`)
- Ставить драфт на паузу/возобновлять (`draft:pause`, `draft:resume`) — только глобальный админ
- Добавлять ботов для тестирования (`lobby:addBots`)
- Исключать участников из лобби (`lobby:kick`)
- Управлять пользователями (логин, роль, команда, пароль)

**НЕ может (критическое требование):**
- Force-pick (принудительный выбор игрока за другого пользователя)
- Undo (отмена пиков)
- Любое вмешательство в логику драфта после старта

**Обоснование:** Честность драфта — ключевой принцип. Админ только организует процесс, не влияя на результат.

#### Участник
**Может:**
- Регистрироваться и входить в систему
- Присоединяться к драфт-комнате
- Выбирать игроков в свой ход
- Просматривать составы других команд (All Teams page)
- Просматривать свою команду и статистику
- Reconnect при разрыве соединения (60 сек grace period)

**Ограничения:**
- Пик возможен только в свой ход
- Salary cap не может быть превышен
- Игрок может занять только один слот

#### Гость (будущая функция)
**Может:**
- Просматривать драфт в режиме реального времени
- Просматривать leaderboard

---

### 2.2 Комнатная модель и драфт

#### Комната (Draft Room)
- **Одна активная комната** на текущую неделю
- Создаётся администратором
- Уникальный `roomId` (например: `weekly-draft`)
- Минимум 2 участника для старта

#### Драфт
- **Тип:** Snake draft (реверс порядка в чётных раундах)
- **Раунды:** 6 по умолчанию (настраивается)
- **Размер ростера:** 6 позиций (LW, C, RW, D, D, G)
- **Порядок выбора:** Определяется админом при старте (`pickOrder`)
- **Таймер на пик:** 60 секунд (настраивается через `timerSec`)

#### Мультипозиции
- Игрок может иметь несколько позиций (например: C/LW)
- Игрок может занять **только один** слот в ростере
- Если игрок C/LW, он может быть выбран либо на C, либо на LW, но **не на оба**
- Валидация на сервере предотвращает дублирование

#### Salary Cap
- **Лимит:** $95,000,000 (по аналогии с NHL)
- Превышение cap блокирует пик
- Отображение в UI: потрачено / осталось / процент
- Формула для расчёта "value": `points / (capHit / 1_000_000)`

---

### 2.3 Логика пика, таймеры и reconnect

#### Таймер на пик
- **60 секунд** серверного отсчёта (не клиентского)
- Тики каждую секунду через WebSocket (`draft:timer`)
- При истечении времени → автоматический автопик

#### Автопик (autopick)
- **Триггер:** Истечение таймера (60 сек)
- **Стратегия:** Лучший игрок по очкам прошлого сезона (`stats.points`)
- **Учитываются:**
  - Доступные позиции в ростере
  - Salary cap (игрок должен влезать)
  - Уже выбранные игроки
- **Индикация:** Специальный badge `auto` в истории пиков

#### Reconnect Grace Period
- **60 секунд** на переподключение
- При disconnect:
  - Статус игрока меняется на "reconnecting"
  - Драфт **ставится на паузу** (таймер останавливается)
  - Другие участники видят статус
- При успешном reconnect:
  - Восстановление состояния драфта
  - Продолжение с текущего пика
- При истечении 60 сек без reconnect:
  - Автопик за отключившегося игрока
  - Пользователь может вернуться в любой момент и продолжить

#### Запрещённые действия (критично)
- ❌ **Force-pick:** Админ не может выбрать игрока за участника
- ❌ **Undo:** Невозможно отменить уже сделанный пик
- ❌ **Ручное изменение таймера:** Только pause/resume всего драфта

---

## 3. Данные и интеграции

### 3.1 Игроки и пул данных

#### Источники данных
- **Основной:** NHL Official API (https://api-web.nhle.com/)
- **Fallback:** ESPN API / Capwages.com (при ошибках основного API)
- **Парсинг:** Cron job каждые 3 часа (обновление статистики)

#### Структура Player
```typescript
interface Player {
  id: string;
  firstName: string;
  lastName: string;
  eligiblePositions: ('C' | 'LW' | 'RW' | 'D' | 'G')[];  // Мультипозиции
  capHit: number;                                         // Зарплата в $
  nhlTeam: string;                                        // Команда NHL
  injuryStatus?: {
    injured: boolean;
    description: string;  // "Upper Body", "Day-to-Day", etc.
  };
  stats: {
    games: number;
    goals: number;
    assists: number;
    points: number;
    // ... остальные метрики
  };
  draftedBy: string | null;
  draftWeek: number | null;
}
```

#### Индикатор травмы
- Если `injuryStatus.injured === true`:
  - ⚠️ Warning в UI при выборе игрока
  - Draft **возможен**, но с предупреждением
  - Рекомендация: не выбирать травмированных игроков

---

### 3.2 Структура команды

```typescript
interface Team {
  userId: string;
  teamName: string;
  logo: string;
  players: string[];         // Array of player IDs
  slots: [
    { position: 'LW', playerId: string | null },
    { position: 'C',  playerId: string | null },
    { position: 'RW', playerId: string | null },
    { position: 'D',  playerId: string | null },
    { position: 'D',  playerId: string | null },
    { position: 'G',  playerId: string | null }
  ];
  salaryTotal: number;       // Max 95,500,000
  week: number;
}
```

**Слоты ростера:**
| Позиция | Количество | Описание |
|---------|-----------|----------|
| LW | 1 | Left Wing |
| C | 1 | Center |
| RW | 1 | Right Wing |
| D | 2 | Defense (два защитника) |
| G | 1 | Goaltender |

---

## 4. Система начисления очков ("scoring")

### 4.1 Скоринг для Skaters (полевые игроки)

| Метрика | Коэффициент | Описание |
|---------|------------|----------|
| Goals (G) | **5** | Забитый гол |
| Assists (A) | **3** | Голевая передача |
| Plus/Minus (+/-) | **±1** | За каждое +1 или -1 |
| Penalty Minutes (PIM) | **-0.3** | За каждую минуту штрафа |
| Power Play Goals (PPG) | **0.5** | Гол в большинстве |
| Power Play Assists (PPA) | **0.3** | Передача в большинстве |
| Short Handed Goals (SHG) | **2** | Гол в меньшинстве |
| Short Handed Assists (SHA) | **1** | Передача в меньшинстве |
| Game-Winning Goals (GWG) | **1** | Победный гол |
| Faceoffs Won (FOW) | **0.1** | За каждое выигранное вбрасывание |
| Faceoffs Lost (FOL) | **-0.05** | За каждое проигранное вбрасывание |
| Hat Tricks (HAT) | **4** | Бонус за хет-трик (3+ гола) |
| Shots on Goal (SOG) | **0.3** | За каждый бросок в створ |
| Hits (HIT) | **0.55** | За каждый силовой приём |
| Blocked Shots (BLK) | **0.55** | За каждый заблокированный бросок |
| Defensemen Points (DEF) | **0.65** | Бонус за очко защитника |

**Примечание:** Метрика `DEF` начисляется **только защитникам** за каждое набранное очко (G или A).

### 4.2 Скоринг для Goaltenders (вратари)

| Метрика | Коэффициент | Описание |
|---------|------------|----------|
| Games Started (GS) | **1.5** | За стартовую игру |
| Wins (W) | **2.5** | За победу |
| Losses (L) | **-1** | За поражение |
| Goals Against (GA) | **-1.8** | За каждый пропущенный гол |
| Saves (SV) | **0.35** | За каждый сейв |
| Shutouts (SO) | **8** | За "сухую" игру |
| Overtime Losses (OTL) | **0.3** | За поражение в овертайме |

### 4.3 Отчётность и UI

#### Личный кабинет пользователя
- **Детализация начислений** по каждому игроку
- **Разбивка по типу очков** (например: Goals: 10, Assists: 6, PPG: 2)
- **Итоговая сумма очков** за неделю
- **Позиция в leaderboard**

#### Leaderboard
- **Недельный рейтинг** (топ-10 по очкам недели)
- **Сезонный рейтинг** (накопленные очки за все недели)
- Фильтрация по неделям
- Сортировка по очкам, salary efficiency, etc.

---

## 5. Безопасность и надёжность

### 5.1 Аутентификация и авторизация
- **Session-based auth** (express-session + httpOnly cookies)
- **Password hashing** (bcrypt, 10 rounds)
- **RBAC** (Role-Based Access Control):
  - Admin: полный доступ к управлению
  - User: доступ только к своим данным
  - Guest: только просмотр (в разработке)

### 5.2 Защита от атак
- **Rate limiting** (v1.0):
  - `/api/auth/*`: 5 req/min
  - `/api/draft/pick`: 10 req/min
  - Остальные endpoints: 100 req/min
- **CSRF protection** (v1.0): csurf middleware
- **XSS protection**: React автоматическое экранирование
- **SQL injection**: параметризованные запросы
- **CORS**: whitelist для production (`CORS_ORIGIN` env)

### 5.3 Атомарные транзакции
**Критические операции:**
- Draft pick → Атомарное обновление (player, team, draftState)
- Kick user → Атомарное удаление из лобби и команды
- Leaderboard update → Транзакция с rollback при ошибке

### 5.4 Fallback механизмы
**При сбое NHL API:**
1. Попытка повторного запроса (retry 3 раза)
2. Переход на fallback API (ESPN)
3. Если fallback недоступен → использование кешированных данных
4. Логирование ошибки для admin dashboard

---

## 6. UI/UX и Edge Cases

### 6.1 Draft Board (Real-time)
**Функции:**
- Все пики видны в реальном времени
- Просмотр составов всех команд (All Teams page)
- Цветовая индикация: ваш ход (зелёный), чужой ход (серый)
- Таймер обратного отсчёта (60 → 0)

### 6.2 All Teams View
**Функции:**
- Таблица всех участников
- Составы команд (6 слотов)
- Salary cap каждой команды
- Value per $ (эффективность)

### 6.3 Специндикаторы
| Ситуация | Индикатор | Описание |
|----------|-----------|----------|
| Reconnect | 🔄 "Reconnecting (45s)" | Пользователь переподключается |
| Autopick | 🤖 Badge "auto" | Автопик произошёл |
| Your turn | 🎯 "ВАШ ХОД" (зелёный) | Сейчас ваша очередь |
| Cap warning | ⚠️ "$2.5M left" | Осталось мало cap |
| Injured | ⚠️ "Injured (Day-to-Day)" | Игрок травмирован |

### 6.4 Обработка ошибок (User-Friendly)
**Вместо технических сообщений:**
- ❌ `"Not your turn!"` → ✅ `"⏳ Подождите своего хода (сейчас ходит Team Alpha)"`
- ❌ `"Salary cap exceeded!"` → ✅ `"💰 Превышен лимит зарплат ($95M). У вас осталось $2.5M"`
- ❌ `"Player already picked!"` → ✅ `"❌ Этот игрок уже выбран командой Team Beta"`
- ❌ `"No free slot!"` → ✅ `"⚠️ У вас нет свободного слота для позиции C"`

---

## 7. Тестирование

### 7.1 Unit и E2E тесты
**Обязательное покрытие:**
- ✅ Мультипозиции (игрок C/LW занимает один слот)
- ✅ Начисление очков по скоринговой формуле
- ✅ Reconnect grace period (60 сек)
- ✅ Автопик при истечении таймера
- ✅ Snake draft (реверс в чётных раундах)
- ✅ Race condition (два пика одновременно)
- ✅ Валидация salary cap

### 7.2 Load и Edge Cases
- Поведение под нагрузкой (50-100 concurrent users)
- Сбой NHL API (fallback на ESPN)
- Гонки при одновременных пиках
- Некорректные входные данные (XSS, SQL injection)

### 7.3 Аудит-логи
**Критичные события (логируются):**
- Kick user
- Pause/resume draft
- Leaderboard update
- Admin изменения (роли, пароли)
- API fallback events

**Доступ:** Через admin dashboard (в разработке)

---

## 8. Вопросы для ревью и доработок

### 8.1 Мультипозиции
- [x] Тест-кейсы на повторное использование (игрок C/LW занимает один слот)
- [x] UI-индикация всех позиций (например: "C / LW")
- [x] Валидация на сервере (невозможность дубля)

### 8.2 Скоринговая формула
- [ ] Зафиксирована публичная формула (этот документ)
- [ ] Возможность изменения через конфиг (на случай смены политики лиги)
- [ ] Тесты на корректность начислений (17 метрик skaters, 7 goalies)

### 8.3 Injury Status
- [ ] Парсинг injury data из NHL API
- [ ] Warning в UI при выборе травмированного игрока
- [ ] Фильтрация травмированных (опционально)

### 8.4 Fallback API
- [ ] Полностью формализованный и протестированный fallback
- [ ] Retry logic (3 попытки → fallback → cache)
- [ ] Логирование в аудит

### 8.5 UI-индикация
- [x] Reconnect indicator
- [x] Autopick badge
- [x] Your turn indicator
- [ ] Forced-pick indicator (запрещено по требованиям)

### 8.6 Аудит-логи
- [ ] Стандартизация формата логов
- [ ] Анализ критичных событий
- [ ] Admin dashboard для просмотра

### 8.7 Awards (Roadmap)
- [ ] MVP недели
- [ ] Best pick (лучший выбор)
- [ ] Other awards (в разработке)

---

## 9. Acceptance Criteria (Критерии приёмки)

**Задача допускается к production, если:**

1. ✅ Все unit/integration/e2e тесты проходят
2. ✅ Нет критичных багов (блокирующих драфт)
3. ✅ RBAC корректно работает (admin не может force-pick/undo)
4. ✅ Salary cap валидация работает на 100%
5. ✅ Мультипозиции корректно обрабатываются
6. ✅ Reconnect grace period (60 сек) работает
7. ✅ Автопик при истечении таймера работает
8. ✅ Snake draft корректно реверсит в чётных раундах
9. ✅ User-friendly error messages реализованы
10. ✅ Security best practices соблюдены (session, bcrypt, CORS)

**Если хотя бы один пункт НЕ выполнен → задача возвращается на доработку.**

---

## 10. Known Limitations (Известные ограничения)

| Ограничение | Причина | Планы |
|------------|---------|-------|
| SQLite (single writer) | MVP требование | Миграция на PostgreSQL в v2.0 |
| In-memory sessions | Простота deployment | Redis session store в v1.0 |
| Отсутствие rate limiting | MVP требование | Внедрение в v1.0 |
| ~700 игроков (не все NHL) | Парсинг в процессе | Полная база в v1.0 |
| Отсутствие email уведомлений | MVP требование | v2.0 |

---

## 11. Non-Functional Requirements (NFR)

### 11.1 Performance

**Latency targets:**
- `draft:pick` event обработка: **<200ms** (p95)
- REST API endpoints: **<100ms** (p95)
- Socket.IO message roundtrip: **<50ms** (p95)
- Database queries: **<50ms** (p95)

**Throughput requirements:**
- **Concurrent users:** 50-100 (MVP), 100-500 (v2.0)
- **Events per minute:** 500 (50 users × 10 picks/min)
- **Simultaneous draft rooms:** 10-15 active rooms

### 11.2 Security (Обязательно для v1.0)

**Authentication & Authorization:**
- ✅ bcrypt password hashing (cost factor 10)
- ✅ httpOnly session cookies
- ✅ CORS whitelist для production
- ✅ RBAC enforcement (admin ≠ force-pick/undo)

**Rate Limiting (v1.0):**
- **API endpoints:** 100 requests/min per IP
- **Draft picks:** 20 picks/min per user (защита от spam)
- **Login attempts:** 5 attempts/15min per IP

**CSRF Protection (v1.0):**
- ✅ CSRF tokens для всех POST/PUT/DELETE
- ✅ Token validation через middleware
- ✅ SameSite cookies

**Input Sanitization (v1.0):**
- ✅ XSS protection (HTML escape всех user inputs)
- ✅ SQL injection protection (параметризованные запросы)
- ✅ Path traversal protection

**Security Headers:**
- ✅ helmet middleware активен
- ✅ Content-Security-Policy настроен
- ✅ X-Frame-Options: DENY

### 11.3 Reliability

**Uptime targets:**
- **MVP (Internal Testing):** 99.0% (7.2 часа downtime/месяц)
- **v1.0 (Public Beta):** 99.5% (3.6 часа downtime/месяц)
- **v2.0 (Production):** 99.9% (43 минуты downtime/месяц)

**Graceful Shutdown:**
- **Timeout:** 30 секунд для завершения активных драфтов
- **Behavior:** Новые запросы отклоняются (503), существующие завершаются
- **Persistence:** Все state сохраняется в SQLite перед shutdown

**Auto-Recovery:**
- **Server restart:** Восстановление active draft rooms из persistence
- **Database restore:** <5 минут при corruption
- **Session recovery:** Redis sessions (v2.0) переживают restart

**Data Integrity:**
- **Zero data loss:** Все picks персистятся немедленно
- **Transactional picks:** Salary cap + slot validation atomic
- **Audit trail:** Полный лог всех picks (для dispute resolution)

### 11.4 Observability

**Structured Logging:**
- ✅ JSON-формат логов (timestamp, level, module, context)
- ✅ File output с ротацией (10MB limit, автоматическая архивация)
- ✅ Separation: `error.log`, `combined.log`
- ✅ Log levels: debug, info, warn, error
- ✅ Context enrichment: roomId, userId, playerId в каждом событии

**Health Checks:**
- ✅ `/health` - Liveness probe (always 200)
- ✅ `/health/ready` - Readiness (validates DB, session)
- ✅ `/health/live` - Kubernetes-style liveness
- ✅ `/health/metrics` - System metrics (CPU, memory)

**Metrics (v1.0):**
- **Draft metrics:** active rooms, total picks, autopick rate
- **Performance:** p50/p95/p99 latency для pick operations
- **Errors:** error rate by type (validation, timeout, etc.)
- **System:** CPU usage, memory, active connections

**Alerting (v1.0):**
- **Critical errors:** Immediate notification (email/Slack)
- **High error rate:** >5% picks fail → alert
- **Performance degradation:** p95 latency >500ms → alert
- **System resources:** CPU >80% / Memory >90% → alert

### 11.5 Scalability

**MVP (Current - SQLite + In-Memory):**
- **Users:** 50-100 concurrent
- **Bottleneck:** SQLite write lock (single writer)
- **Deployment:** Single Node.js instance

**v1.0 (Redis Sessions):**
- **Users:** 50-100 concurrent (unchanged)
- **Benefit:** Session persistence (survive restart)
- **Cost:** Minimal (Upstash free tier)

**v2.0 (PostgreSQL + Redis):**
- **Users:** 100-500 concurrent
- **Database:** PostgreSQL (connection pool 20)
- **Sessions:** Redis session store
- **Deployment:** Single instance (clustering ready)

**v3.0 (Horizontal Scaling):**
- **Users:** 500+ concurrent
- **Architecture:** Node.js cluster (4 workers)
- **Redis:** Socket.IO adapter для pub/sub
- **Load Balancer:** nginx или cloud LB

### 11.6 User Experience

**Error Messages:**
- ❌ **НЕТ:** Технические stack traces
- ✅ **ДА:** User-friendly объяснения + рекомендации

**Примеры:**
```
БАД:  "TypeError: Cannot read property 'salary' of undefined"
ХОРОШО: "Игрок не найден. Обновите список игроков и попробуйте снова."

БАД:  "SALARY_CAP_EXCEEDED"
ХОРОШО: "Превышен salary cap на $2,500,000. Выберите более дешёвого игрока."
```

**Loading States:**
- ✅ Skeleton screens для операций >500ms
- ✅ Progress indicators для long-running tasks
- ✅ Optimistic UI updates (pick немедленно отображается)

**Accessibility (WCAG 2.1 Level AA):**
- ✅ Keyboard navigation для всех действий
- ✅ ARIA labels для screen readers
- ✅ Color contrast ratio >4.5:1
- ✅ Focus indicators видны

### 11.7 Edge Cases и обработка

| Сценарий | Решение | Реализация |
|----------|---------|------------|
| **Pick в последнюю секунду, пакет приходит после timeout** | Grace period 2 сек после timeout, затем reject с "Time expired" | `draftTimer.ts` |
| **2 пользователя пикают одного игрока одновременно** | First-write-wins + error response "Player already picked" | `draft.ts:makePick` |
| **Admin кикает пользователя во время его пика** | Автопик лучшего доступного игрока + notification kicked user | `lobby.ts:kickUser` |
| **Server restart во время драфта** | Restore из SQLite persistence, reconnect grace 60 sec | `persistence/restore.ts` |
| **Потеря WebSocket соединения** | Автоматический reconnect, 60 sec grace period | Socket.IO client |
| **Salary cap race condition (параллельные пики)** | Transactional validation, lock state во время pick | `draft.ts:makePick` |
| **Пользователь пытается пикать НЕ в свой ход** | Reject с "Not your turn" + показать текущего активного игрока | `draft.ts:validateTurn` |
| **Database corruption** | Auto-recovery из backup (v2.0), fallback to in-memory (MVP) | `persistence/sqlite.ts` |
| **Memory leak в long-running server** | Graceful restart каждые 7 дней (production) | PM2 restart policy |

### 11.8 Acceptance Criteria для Production

**Система готова к public release ТОЛЬКО если:**

**Security (все обязательны):**
1. ✅ Rate limiting активен и протестирован (429 после лимита)
2. ✅ CSRF protection работает (403 без токена)
3. ✅ Input sanitization покрывает 100% user inputs
4. ✅ Security audit пройден (OWASP Top 10 checklist)
5. ✅ Penetration testing выполнен

**Observability (все обязательны):**
6. ✅ Structured logs пишутся в файлы с rotation
7. ✅ Health checks доступны и протестированы
8. ✅ Error alerting настроен (email/Slack)
9. ✅ Monitoring dashboard доступен

**Testing (все обязательны):**
10. ✅ Все unit/integration/e2e тесты проходят (100%)
11. ✅ Load testing: 50 concurrent users без деградации
12. ✅ Stress testing: graceful degradation при 200% нагрузке
13. ✅ Security testing: rate limiting, CSRF, XSS проверены

**Documentation (все обязательны):**
14. ✅ API documentation актуальна (Swagger)
15. ✅ Deployment guide обновлен
16. ✅ Incident response playbook создан
17. ✅ User guide завершён

**Performance (все обязательны):**
18. ✅ p95 latency <200ms для draft:pick
19. ✅ Zero data loss под нагрузкой
20. ✅ Graceful shutdown работает корректно

---

**Данный документ является финальной спецификацией бизнес-требований.**  
**Любые изменения требований должны быть согласованы и задокументированы.**  

**Последнее обновление:** 24.10.2025  
**Версия:** 2.1 (добавлены NFR)
