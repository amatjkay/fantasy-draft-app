---
description: How to run E2E locally and in CI reliably
---

# Goal
Надёжный запуск Playwright e2e локально и в CI без флейков: изоляция комнат, корректный старт server+client, артефакты на фейлах.

# Предварительные условия
- Node.js 20 LTS
- Установлены зависимости в root, server, client
- Свободны порты 3001 (server), 5173 (client)

# Локальный запуск (рекомендуемый порядок)
1) Проверить, что порты свободны
   - Windows
     - netstat -ano | findstr :5173
     - netstat -ano | findstr :3001
   - Если заняты — определить PID и остановить
     - Get-NetTCPConnection -LocalPort 5173 | Select-Object -Unique OwningProcess
     - Get-Process -Id <PID>
     - Stop-Process -Id <PID> -Force

// turbo-all
2) Установить браузеры Playwright
   - npx playwright install

3) Запустить все e2e с отчётами и трассировкой на фейлах
   - npx playwright test --reporter=html,line --trace=retain-on-failure

# Советы по стабильности
- Уникальный roomId для каждого прогона через URL (?roomId=<rnd>)
- В playwright.config.ts выставить reuseExistingServer=false и таймауты >= 120s
- Использовать data-testid и явные ожидания (attach/visible/enable)

# Артефакты
- В случае падения открыть HTML отчёт (playwright-report) и trace (test-results/*/trace.zip)
- Локально: npx playwright show-trace test-results/<path>/trace.zip

# CI (GitHub Actions)
- Job e2e настроен с needs: [server, client], установкой browsers и выгрузкой артефактов
- Можно расширить матрицу браузеров (chromium, firefox, webkit) в playwright.config.ts
