/**
 * PM2 Production Configuration
 * 
 * Для production окружения с оптимизацией производительности
 * 
 * Команды:
 *   npm run pm2:prod      - Собрать и запустить production версию
 *   npm run pm2:prod:stop - Остановить production сервисы
 */

module.exports = {
  apps: [
    {
      name: 'draft-server-prod',
      cwd: './server',
      script: 'npm.cmd',
      args: 'start',
      interpreter: 'none',
      windowsHide: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      // Production настройки
      autorestart: true,
      max_restarts: 5,
      min_uptime: '30s',
      restart_delay: 3000,
      // Логирование
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/server-prod-error.log',
      out_file: './logs/server-prod-out.log',
      merge_logs: true,
      // Health check
      health_check: {
        enabled: true,
        endpoint: 'http://localhost:3001/health',
        interval: 60000,
        timeout: 10000,
      },
    },
    {
      name: 'draft-client-prod',
      cwd: './client',
      script: 'npm.cmd',
      args: 'run preview',
      interpreter: 'none',
      windowsHide: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
      // Production настройки
      autorestart: true,
      max_restarts: 5,
      min_uptime: '30s',
      restart_delay: 3000,
      // Логирование
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/client-prod-error.log',
      out_file: './logs/client-prod-out.log',
      merge_logs: true,
    },
  ],
};
