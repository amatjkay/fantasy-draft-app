# 🚀 PM2 Process Manager — Руководство

PM2 — это production-ready менеджер процессов для Node.js приложений с автоматическим перезапуском, мониторингом и логированием.

---

## 📦 Первичная Настройка

### 1. Установка PM2

```bash
npm run pm2:setup
```

Этот скрипт автоматически:
- ✅ Установит PM2 глобально (если не установлен)
- ✅ Создаст директорию `logs/` для логов
- ✅ Настроит ротацию логов (10MB, 7 дней хранения)
- ✅ Предложит настроить автозапуск при старте системы

---

## 🎮 Основные Команды

### Development (разработка)

```bash
# Запустить server + client в dev режиме
npm run pm2:start

# Проверить статус всех процессов
npm run pm2:status

# Смотреть логи в реальном времени
npm run pm2:logs

# Только ошибки
npm run pm2:logs:error

# Остановить все сервисы
npm run pm2:stop

# Перезапустить (после изменений в коде)
npm run pm2:restart
```

### Production (продакшн)

```bash
# Собрать и запустить production версию
npm run pm2:prod

# Остановить production сервисы
npm run pm2:prod:stop
```

### Monitoring (мониторинг)

```bash
# Открыть интерактивный dashboard
npm run pm2:monitor
```

**Dashboard показывает:**
- CPU и память каждого процесса
- Количество рестартов
- Uptime
- Логи в реальном времени

---

## 📊 Что Дает PM2?

### ✅ Автоматический Перезапуск

Если server или client падают — PM2 автоматически перезапускает их через 2 секунды.

```bash
# Пример: server упал
[PM2] Process draft-server crashed
[PM2] Restarting draft-server in 2000ms
[PM2] Process draft-server restarted
```

### ✅ Health Checks

PM2 проверяет `/health` endpoint каждые 30 секунд:
- Если server не отвечает — автоматический restart
- Настраивается в `ecosystem.config.js`

### ✅ Логирование

Все логи автоматически сохраняются в `logs/`:

```
logs/
├── server-out.log       # Стандартный вывод server
├── server-error.log     # Ошибки server
├── client-out.log       # Стандартный вывод client
└── client-error.log     # Ошибки client
```

**Ротация логов:**
- Максимальный размер файла: 10MB
- Хранение: 7 дней
- Архивация: gzip сжатие старых логов

### ✅ Мониторинг

```bash
npm run pm2:monitor
```

Показывает:
- **CPU:** Загрузка процессора в реальном времени
- **Memory:** Использование памяти
- **Restarts:** Количество перезапусков
- **Uptime:** Время работы без падений
- **Logs:** Логи в реальном времени

---

## 🔧 Конфигурация

### Development: `ecosystem.config.js`

```javascript
{
  name: 'draft-server',
  cwd: './server',
  script: 'npm run dev',
  autorestart: true,        // Автоматический restart
  max_restarts: 10,         // Макс 10 рестартов за минуту
  min_uptime: '10s',        // Минимальное время работы
  health_check: {           // Health check каждые 30 сек
    endpoint: 'http://localhost:3001/health',
    interval: 30000,
  }
}
```

### Production: `ecosystem.prod.config.js`

Отличия от dev:
- Использует `npm start` вместо `npm run dev`
- Больше `min_uptime` (30s вместо 10s)
- Меньше `max_restarts` (5 вместо 10)
- Больший интервал health check (60s вместо 30s)

---

## 📝 Практические Сценарии

### Сценарий 1: Ежедневная Разработка

```bash
# Утром: запускаем проект
npm run pm2:start

# Работаем весь день, не следим за терминалами
# PM2 автоматически перезапускает при падении

# Вечером: смотрим что происходило
npm run pm2:logs

# Останавливаем
npm run pm2:stop
```

### Сценарий 2: Debugging

```bash
# Запускаем
npm run pm2:start

# Что-то пошло не так, смотрим только ошибки
npm run pm2:logs:error

# Или открываем файл логов напрямую
notepad logs/server-error.log
```

### Сценарий 3: Production Deploy

```bash
# 1. Собираем production версию
npm run pm2:prod

# 2. Проверяем статус
npm run pm2:status

# 3. Мониторим производительность
npm run pm2:monitor

# 4. Смотрим логи
npm run pm2:logs
```

### Сценарий 4: Server Упал

```bash
# PM2 автоматически перезапустит через 2 секунды
# Вы увидите в логах:
[PM2] Process draft-server stopped
[PM2] Process draft-server restarted

# Если рестартов слишком много (>10 за минуту), PM2 остановит процесс
# Проверяем что случилось:
npm run pm2:logs:error
```

---

## 🛠️ Расширенные Команды

### Управление Отдельными Процессами

```bash
# Перезапустить только server
pm2 restart draft-server

# Остановить только client
pm2 stop draft-client

# Логи только от server
pm2 logs draft-server

# Удалить процесс из PM2
pm2 delete draft-server
```

### Сохранение Конфигурации

```bash
# Сохранить текущее состояние PM2
pm2 save

# Восстановить сохраненное состояние
pm2 resurrect
```

### Автозапуск при Старте Системы

```bash
# Настроить автозапуск (требует прав администратора)
pm2 startup

# После запуска сервисов сохранить конфигурацию
pm2 save

# Отключить автозапуск
pm2 unstartup
```

---

## 🚨 Troubleshooting

### Проблема: PM2 не установлен

```bash
# Решение: Установить глобально
npm install -g pm2

# Или через setup скрипт
npm run pm2:setup
```

### Проблема: Порты заняты

```bash
# Проверить что запущено
npm run pm2:status

# Остановить все процессы
npm run pm2:stop

# Удалить из PM2
npm run pm2:delete

# Запустить заново
npm run pm2:start
```

### Проблема: Слишком много рестартов

```bash
# Смотрим логи ошибок
npm run pm2:logs:error

# Проверяем health check endpoint
curl http://localhost:3001/health

# Если проблема не устраняется, останавливаем
npm run pm2:stop

# Исправляем код, запускаем снова
npm run pm2:start
```

### Проблема: Логи слишком большие

```bash
# PM2 автоматически ротирует логи (10MB, 7 дней)
# Если нужно очистить вручную:
pm2 flush

# Старые логи архивируются в logs/ с расширением .gz
```

---

## 📊 Сравнение с orchestrator.js

| Функция | orchestrator.js | PM2 |
|---------|----------------|-----|
| Запуск server/client | ✅ | ✅ |
| Автоперезапуск | ✅ (базовый) | ✅ (продвинутый) |
| Логирование | Только console | Файлы + console |
| Мониторинг | ❌ | ✅ Dashboard |
| Health checks | ❌ | ✅ |
| Ротация логов | ❌ | ✅ |
| Автозапуск при старте | ❌ | ✅ |
| Production ready | ⚠️ | ✅ |

**Рекомендация:**
- **Development:** Используйте PM2 (удобнее)
- **E2E Tests:** Используйте orchestrator.js (специальные настройки)
- **Production:** Только PM2

---

## 🎯 Лучшие Практики

1. **Всегда проверяйте статус после запуска:**
   ```bash
   npm run pm2:start
   npm run pm2:status
   ```

2. **Регулярно смотрите логи:**
   ```bash
   npm run pm2:logs:error
   ```

3. **Используйте мониторинг при проблемах:**
   ```bash
   npm run pm2:monitor
   ```

4. **В production настройте автозапуск:**
   ```bash
   pm2 startup
   npm run pm2:prod
   pm2 save
   ```

5. **Периодически очищайте старые логи:**
   ```bash
   # PM2 делает это автоматически через 7 дней
   # Но можно и вручную:
   pm2 flush
   ```

---

## 📚 Дополнительная Информация

- **Официальная документация PM2:** https://pm2.keymetrics.io/
- **GitHub репозиторий:** https://github.com/Unitech/pm2
- **Конфигурация для этого проекта:** `ecosystem.config.js`, `ecosystem.prod.config.js`

---

**Готово! Теперь вы можете не следить за терминалами — PM2 сделает это за вас! 🎉**
