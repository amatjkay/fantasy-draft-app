#!/usr/bin/env node
/**
 * PM2 Setup Script
 * 
 * Автоматическая настройка PM2 для проекта:
 * - Установка PM2 (если не установлен)
 * - Создание директории для логов
 * - Первичная конфигурация
 * - Настройка автозапуска при старте системы (опционально)
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const LOGS_DIR = path.join(ROOT, 'logs');

const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';

function log(msg) {
  console.log(`[setup-pm2] ${msg}`);
}

function error(msg) {
  console.error(`[setup-pm2] ❌ ${msg}`);
}

function success(msg) {
  console.log(`[setup-pm2] ✅ ${msg}`);
}

function exec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
  } catch (err) {
    return null;
  }
}

function checkPm2Installed() {
  const result = exec('pm2 --version');
  return result !== null;
}

function installPm2() {
  log('PM2 не установлен. Устанавливаю глобально...');
  try {
    execSync('npm install -g pm2', { stdio: 'inherit' });
    success('PM2 успешно установлен');
    return true;
  } catch (err) {
    error('Не удалось установить PM2. Установите вручную: npm install -g pm2');
    return false;
  }
}

function createLogsDirectory() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    success(`Создана директория для логов: ${LOGS_DIR}`);
  } else {
    log(`Директория логов уже существует: ${LOGS_DIR}`);
  }
}

function setupLogrotate() {
  log('Настраиваю ротацию логов...');
  try {
    execSync('pm2 install pm2-logrotate', { stdio: 'inherit' });
    // Настройки: сохранять логи за последние 7 дней, ротация каждый день
    execSync('pm2 set pm2-logrotate:max_size 10M', { stdio: 'pipe' });
    execSync('pm2 set pm2-logrotate:retain 7', { stdio: 'pipe' });
    execSync('pm2 set pm2-logrotate:compress true', { stdio: 'pipe' });
    success('Ротация логов настроена (10MB, 7 дней хранения)');
  } catch (err) {
    error('Не удалось настроить ротацию логов');
  }
}

async function askAutostart() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('Настроить автозапуск при старте системы? (y/n): ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

function setupAutostart() {
  log('Настраиваю автозапуск при старте системы...');
  try {
    // Сохраняем текущую конфигурацию PM2
    execSync('pm2 save', { stdio: 'pipe' });
    // Настраиваем startup script
    const startupCmd = exec('pm2 startup');
    if (startupCmd && startupCmd.includes('sudo')) {
      log('Для автозапуска выполните команду с правами администратора:');
      console.log(startupCmd);
    } else {
      success('Автозапуск настроен');
    }
  } catch (err) {
    error('Не удалось настроить автозапуск');
  }
}

function showQuickStart() {
  console.log('\n' + '='.repeat(60));
  console.log('🎉 PM2 НАСТРОЕН! БЫСТРЫЙ СТАРТ:');
  console.log('='.repeat(60));
  console.log('');
  console.log('📦 РАЗРАБОТКА (dev):');
  console.log('   npm run pm2:start       - Запустить сервисы');
  console.log('   npm run pm2:status      - Проверить статус');
  console.log('   npm run pm2:logs        - Смотреть логи');
  console.log('   npm run pm2:stop        - Остановить всё');
  console.log('');
  console.log('🚀 PRODUCTION:');
  console.log('   npm run pm2:prod        - Собрать и запустить');
  console.log('   npm run pm2:prod:stop   - Остановить');
  console.log('');
  console.log('🔍 МОНИТОРИНГ:');
  console.log('   npm run pm2:monitor     - Открыть dashboard');
  console.log('   npm run pm2:logs:error  - Только ошибки');
  console.log('');
  console.log('📂 ЛОГИ СОХРАНЯЮТСЯ В: ./logs/');
  console.log('='.repeat(60));
}

async function main() {
  console.log('');
  log('🚀 Настройка PM2 для Fantasy Draft App...');
  console.log('');

  // Проверка PM2
  if (!checkPm2Installed()) {
    if (!installPm2()) {
      process.exit(1);
    }
  } else {
    success('PM2 уже установлен');
  }

  // Создание директории логов
  createLogsDirectory();

  // Настройка ротации логов
  setupLogrotate();

  // Автозапуск (опционально)
  console.log('');
  const shouldAutostart = await askAutostart();
  if (shouldAutostart) {
    setupAutostart();
  }

  // Показываем quick start
  showQuickStart();
  
  console.log('');
  success('Настройка завершена! Теперь запустите: npm run pm2:start');
  console.log('');
}

main().catch(err => {
  error(`Ошибка: ${err.message}`);
  process.exit(1);
});
