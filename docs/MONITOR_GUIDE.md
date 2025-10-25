# 🚀 Process Monitor — Автоматическое Управление (Windows)

Нативное решение для Windows с автоматическим перезапуском, мониторингом и логированием.

---

## ⚡ Быстрый Старт

### 1️⃣ Запуск (одна команда)

```bash
npm run monitor:start
```

**Готово!** Server и Client работают в фоне с автоматическим мониторингом.

### 2️⃣ Проверка Статуса

```bash
npm run monitor:status
```

Вы увидите:
```
============================================================
📊 PROCESS STATUS
============================================================
✅ RUNNING | server          | PID: 12345
✅ RUNNING | client          | PID: 12346
============================================================
```

### 3️⃣ Остановка

```bash
npm run monitor:stop
```

---

## 🎯 Что Это Дает?

### ✅ Автоматический Перезапуск
Если server или client падают — автоматически перезапускаются через 2 секунды (до 10 раз).

### ✅ Логирование в Файлы
Все логи сохраняются в `logs/`:
- `server-out.log` — стандартный вывод
- `server-error.log` — ошибки
- `client-out.log` — стандартный вывод
- `client-error.log` — ошибки

### ✅ Health Checks
Монитор проверяет `http://localhost:3001/health` каждые 30 секунд.

### ✅ Graceful Shutdown
При остановке (Ctrl+C или npm run monitor:stop) все процессы корректно завершаются.

### ✅ Статус Каждые 60 Секунд
Автоматически показывает статус всех процессов каждую минуту.

---

## 📝 Все Команды

| Команда | Описание |
|---------|----------|
| `npm run monitor:start` | Запустить в dev режиме |
| `npm run monitor:prod` | Запустить в production режиме |
| `npm run monitor:stop` | Остановить все процессы |
| `npm run monitor:status` | Показать текущий статус |

---

## 🔧 Типичный Рабочий День

```bash
# Утром: запускаем
npm run monitor:start

# Монитор работает в фоне, перезапускает при падении
# Можете закрыть окно терминала - процессы продолжат работать

# Если хотите проверить статус (в новом терминале)
npm run monitor:status

# Если хотите посмотреть логи
notepad logs\server-out.log
notepad logs\server-error.log

# Вечером: останавливаем
npm run monitor:stop
```

---

## 📊 Что Видно в Консоли

При запуске `npm run monitor:start`:

```
[2025-10-24 17:35:00] [monitor] Starting in dev mode...
[2025-10-24 17:35:00] [server] Starting: npm.cmd run dev
[2025-10-24 17:35:01] [client] Starting: npm.cmd run dev
[2025-10-24 17:35:02] [monitor] ✅ All processes started. Press Ctrl+C to stop.
[2025-10-24 17:35:02] [monitor] Logs: C:\dev\fantasy-draft-app\logs

[server] > server@0.1.0 dev
[server] > ts-node-dev --respawn --transpile-only src/index.ts
[client] > client@0.1.0 dev
[client] > vite

============================================================
📊 PROCESS STATUS (автоматически каждые 60 сек)
============================================================
✅ server          | PID: 12345 | Uptime: 60s | Restarts: 0
✅ client          | PID: 12346 | Uptime: 60s | Restarts: 0
============================================================
```

---

## 🚨 Сценарии

### Сценарий 1: Server Упал

```
[server] Process exited with code 1
[server] Auto-restarting (1/10) in 2 seconds...
[server] Starting: npm.cmd run dev
```

Монитор автоматически перезапускает процесс.

### Сценарий 2: Слишком Много Рестартов

```
[server] Exited with code 1
[server] Auto-restarting (10/10) in 2 seconds...
[server] Too many restarts (10), giving up.
```

После 10 неудачных попыток монитор прекращает перезапуск. Проверьте логи:

```bash
notepad logs\server-error.log
```

### Сценарий 3: Graceful Shutdown (Ctrl+C)

```
[monitor] Received SIGINT, shutting down gracefully...
[server] Stopping...
[client] Stopping...
[monitor] ✅ Shutdown complete
```

---

## 🛠️ Troubleshooting

### Проблема: Процессы не останавливаются

```bash
# Проверьте статус
npm run monitor:status

# Попробуйте остановить снова
npm run monitor:stop

# Если не помогло, убейте вручную через Task Manager
# (найдите node.exe процессы)
```

### Проблема: Порты заняты

```bash
# Остановите монитор
npm run monitor:stop

# Убедитесь что процессы остановлены
npm run monitor:status

# Запустите снова
npm run monitor:start
```

### Проблема: Хотите посмотреть логи в реальном времени

```powershell
# В PowerShell используйте Get-Content с -Wait
Get-Content logs\server-out.log -Wait

# Или в отдельном окне терминала
notepad logs\server-out.log
```

---

## 📈 Production Режим

```bash
# 1. Сначала собираем проект
npm run build:all

# 2. Запускаем в production
npm run monitor:prod

# 3. Проверяем статус
npm run monitor:status

# 4. Останавливаем
npm run monitor:stop
```

В production режиме:
- Server запускается через `npm start` (уже собранный)
- Client запускается через `npm run preview` (Vite preview)
- Логи сохраняются в `logs/server-prod-*.log` и `logs/client-prod-*.log`

---

## 🎯 Преимущества vs orchestrator.js

| Функция | orchestrator.js | monitor.js |
|---------|----------------|------------|
| Запуск процессов | ✅ | ✅ |
| Автоперезапуск | ✅ (базовый) | ✅ (умный, до 10 раз) |
| Логирование | Только console | ✅ Файлы + console |
| Статус мониторинг | ❌ | ✅ Каждые 60 сек |
| Health checks | ❌ | ✅ |
| Graceful shutdown | Частично | ✅ Полностью |
| PID tracking | ✅ | ✅ |
| Работает на Windows | ✅ | ✅ 100% |

---

## 💡 Лучшие Практики

1. **Всегда проверяйте статус после запуска:**
   ```bash
   npm run monitor:start
   # Подождите 5-10 секунд
   npm run monitor:status
   ```

2. **Периодически проверяйте логи ошибок:**
   ```bash
   notepad logs\server-error.log
   notepad logs\client-error.log
   ```

3. **Graceful shutdown перед закрытием компьютера:**
   ```bash
   npm run monitor:stop
   ```

4. **В production используйте отдельную команду:**
   ```bash
   npm run monitor:prod
   ```

---

## 📂 Структура Логов

```
logs/
├── server-out.log       # Server stdout (dev)
├── server-error.log     # Server stderr (dev)
├── client-out.log       # Client stdout (dev)
├── client-error.log     # Client stderr (dev)
├── server-prod-out.log     # Server stdout (prod)
├── server-prod-error.log   # Server stderr (prod)
├── client-prod-out.log     # Client stdout (prod)
└── client-prod-error.log   # Client stderr (prod)
```

Логи автоматически создаются и ротируются (новые записи добавляются в конец).

---

## 🎉 Готово!

Теперь у вас есть нативный монитор процессов для Windows с:
- ✅ Автоматическим перезапуском
- ✅ Логированием в файлы
- ✅ Health checks
- ✅ Graceful shutdown
- ✅ Статусом каждую минуту

**Просто запустите и забудьте:**
```bash
npm run monitor:start
```

**Приложение доступно:**
- Client: http://localhost:5173
- Server: http://localhost:3001
- Health: http://localhost:3001/health
