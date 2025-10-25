/**
 * PM2 Ecosystem Configuration
 * 
 * Управление server и client процессами с автоматическим перезапуском
 * 
 * Команды:
 *   npm run pm2:start     - Запустить все сервисы
 *   npm run pm2:stop      - Остановить все сервисы
 *   npm run pm2:restart   - Перезапустить все сервисы
 *   npm run pm2:status    - Показать статус
 *   npm run pm2:logs      - Показать логи
 *   npm run pm2:monitor   - Открыть monitoring dashboard
 */

module.exports = {
  apps: [
    {
      name: 'draft-server',
      cwd: './server',
      script: 'npm.cmd',
      args: 'run dev',
      interpreter: 'none',
      windowsHide: true,
      watch: false,
      env: {
        NODE_ENV: 'development',
        PORT: 3001,
        RECONNECT_GRACE_MS: 60000,
      },
      // Автоперезапуск при падении
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      // Логирование
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/server-error.log',
      out_file: './logs/server-out.log',
      merge_logs: true,
      // Health check
      health_check: {
        enabled: true,
        endpoint: 'http://localhost:3001/health',
        interval: 30000, // Проверка каждые 30 секунд
        timeout: 5000,
      },
    },
    {
      name: 'draft-client',
      cwd: './client',
      script: 'npm.cmd',
      args: 'run dev',
      interpreter: 'none',
      windowsHide: true,
      watch: false,
      env: {
        NODE_ENV: 'development',
      },
      // Автоперезапуск при падении
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      // Логирование
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/client-error.log',
      out_file: './logs/client-out.log',
      merge_logs: true,
    },
  ],
};
