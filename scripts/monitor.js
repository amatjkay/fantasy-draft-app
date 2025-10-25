#!/usr/bin/env node
/**
 * Process Monitor & Auto-Restart Manager
 * 
 * Автоматическое управление server и client с:
 * - Автоперезапуском при падении
 * - Мониторингом состояния
 * - Логированием в файлы
 * - Health checks
 * - Graceful shutdown
 * 
 * Команды:
 *   npm run monitor:start   - Запустить с мониторингом
 *   npm run monitor:prod    - Production режим
 *   npm run monitor:stop    - Остановить
 *   npm run monitor:status  - Показать статус
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const LOGS_DIR = path.join(ROOT, 'logs');
const PID_FILE = path.join(__dirname, '.monitor-pids.json');

const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';

// Конфигурация
const CONFIG = {
  dev: {
    server: {
      name: 'server',
      cwd: path.join(ROOT, 'server'),
      command: npmCmd,
      args: ['run', 'dev'],
      env: { NODE_ENV: 'development', PORT: 3001 },
      port: 3001,
      healthCheck: 'http://localhost:3001/health',
    },
    client: {
      name: 'client',
      cwd: path.join(ROOT, 'client'),
      command: npmCmd,
      args: ['run', 'dev'],
      env: { NODE_ENV: 'development' },
      port: 5173,
      healthCheck: null, // Vite не имеет health endpoint
    },
  },
  prod: {
    server: {
      name: 'server-prod',
      cwd: path.join(ROOT, 'server'),
      command: npmCmd,
      args: ['start'],
      env: { NODE_ENV: 'production', PORT: 3001 },
      port: 3001,
      healthCheck: 'http://localhost:3001/health',
    },
    client: {
      name: 'client-prod',
      cwd: path.join(ROOT, 'client'),
      command: npmCmd,
      args: ['run', 'preview'],
      env: { NODE_ENV: 'production' },
      port: 5173,
      healthCheck: null,
    },
  },
};

class ProcessMonitor {
  constructor(mode = 'dev') {
    this.mode = mode;
    this.processes = new Map();
    this.restartCounts = new Map();
    this.stopping = false;
    this.logStreams = new Map();
    
    // Ensure logs directory exists
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
  }

  log(prefix, message) {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    console.log(`[${timestamp}] [${prefix}] ${message}`);
  }

  createLogStream(name, type) {
    const filename = path.join(LOGS_DIR, `${name}-${type}.log`);
    return fs.createWriteStream(filename, { flags: 'a' });
  }

  async healthCheck(url) {
    return new Promise((resolve) => {
      http.get(url, (res) => {
        resolve(res.statusCode === 200);
      }).on('error', () => {
        resolve(false);
      });
    });
  }

  async startProcess(config) {
    const { name, cwd, command, args, env, healthCheck } = config;
    
    this.log(name, `Starting: ${command} ${args.join(' ')}`);

    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: 'pipe',
      shell: isWin,
    });

    // Setup logging
    const outStream = this.createLogStream(name, 'out');
    const errStream = this.createLogStream(name, 'error');
    this.logStreams.set(name, { outStream, errStream });

    child.stdout.on('data', (data) => {
      const msg = data.toString();
      process.stdout.write(`[${name}] ${msg}`);
      outStream.write(`[${new Date().toISOString()}] ${msg}`);
    });

    child.stderr.on('data', (data) => {
      const msg = data.toString();
      process.stderr.write(`[${name}] ${msg}`);
      errStream.write(`[${new Date().toISOString()}] ${msg}`);
    });

    child.on('exit', (code, signal) => {
      this.log(name, `Exited with code ${code}, signal ${signal}`);
      this.processes.delete(name);
      
      // Close log streams
      const streams = this.logStreams.get(name);
      if (streams) {
        streams.outStream.end();
        streams.errStream.end();
        this.logStreams.delete(name);
      }

      // Auto-restart if not stopping
      if (!this.stopping) {
        const restarts = this.restartCounts.get(name) || 0;
        
        if (restarts < 10) {
          this.restartCounts.set(name, restarts + 1);
          this.log(name, `Auto-restarting (${restarts + 1}/10) in 2 seconds...`);
          setTimeout(() => {
            this.startProcess(config);
          }, 2000);
        } else {
          this.log(name, 'Too many restarts (10), giving up.');
        }
      }
    });

    this.processes.set(name, { child, config, startTime: Date.now() });
    
    // Health check monitoring (if configured)
    if (healthCheck) {
      this.startHealthCheckMonitoring(name, healthCheck);
    }
  }

  startHealthCheckMonitoring(name, url) {
    const interval = setInterval(async () => {
      if (!this.processes.has(name)) {
        clearInterval(interval);
        return;
      }

      const healthy = await this.healthCheck(url);
      if (!healthy) {
        this.log(name, `Health check failed: ${url}`);
        // Could trigger restart here if needed
      }
    }, 30000); // Check every 30 seconds
  }

  async start() {
    this.log('monitor', `Starting in ${this.mode} mode...`);
    
    const config = CONFIG[this.mode];
    if (!config) {
      console.error(`Invalid mode: ${this.mode}`);
      process.exit(1);
    }

    // Start all processes
    for (const processConfig of Object.values(config)) {
      await this.startProcess(processConfig);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Stagger starts
    }

    // Save PIDs
    this.savePids();

    // Setup graceful shutdown
    this.setupGracefulShutdown();

    this.log('monitor', '✅ All processes started. Press Ctrl+C to stop.');
    this.log('monitor', `Logs: ${LOGS_DIR}`);
    
    // Keep process alive and show status every 60 seconds
    this.statusInterval = setInterval(() => {
      this.showStatus();
    }, 60000);
  }

  showStatus() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 PROCESS STATUS');
    console.log('='.repeat(60));
    
    for (const [name, info] of this.processes.entries()) {
      const uptime = Math.floor((Date.now() - info.startTime) / 1000);
      const restarts = this.restartCounts.get(name) || 0;
      console.log(`✅ ${name.padEnd(15)} | PID: ${info.child.pid} | Uptime: ${uptime}s | Restarts: ${restarts}`);
    }
    
    if (this.processes.size === 0) {
      console.log('❌ No processes running');
    }
    
    console.log('='.repeat(60) + '\n');
  }

  savePids() {
    const pids = {};
    for (const [name, info] of this.processes.entries()) {
      pids[name] = info.child.pid;
    }
    fs.writeFileSync(PID_FILE, JSON.stringify(pids, null, 2));
  }

  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      this.log('monitor', `Received ${signal}, shutting down gracefully...`);
      this.stopping = true;
      
      if (this.statusInterval) {
        clearInterval(this.statusInterval);
      }

      // Kill all processes
      for (const [name, info] of this.processes.entries()) {
        this.log(name, 'Stopping...');
        try {
          if (isWin) {
            spawn('taskkill', ['/pid', info.child.pid, '/f', '/t']);
          } else {
            info.child.kill('SIGTERM');
          }
        } catch (err) {
          this.log(name, `Error stopping: ${err.message}`);
        }
      }

      // Close all log streams
      for (const [name, streams] of this.logStreams.entries()) {
        streams.outStream.end();
        streams.errStream.end();
      }

      // Wait a bit for processes to exit
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Remove PID file
      if (fs.existsSync(PID_FILE)) {
        fs.unlinkSync(PID_FILE);
      }

      this.log('monitor', '✅ Shutdown complete');
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  }

  static status() {
    if (!fs.existsSync(PID_FILE)) {
      console.log('❌ No processes running (PID file not found)');
      return;
    }

    const pids = JSON.parse(fs.readFileSync(PID_FILE, 'utf8'));
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 PROCESS STATUS');
    console.log('='.repeat(60));
    
    for (const [name, pid] of Object.entries(pids)) {
      const running = ProcessMonitor.isPidRunning(pid);
      const status = running ? '✅ RUNNING' : '❌ STOPPED';
      console.log(`${status} | ${name.padEnd(15)} | PID: ${pid}`);
    }
    
    console.log('='.repeat(60) + '\n');
  }

  static isPidRunning(pid) {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  static async stop() {
    if (!fs.existsSync(PID_FILE)) {
      console.log('❌ No processes running (PID file not found)');
      return;
    }

    const pids = JSON.parse(fs.readFileSync(PID_FILE, 'utf8'));
    
    console.log('🛑 Stopping all processes...');
    
    for (const [name, pid] of Object.entries(pids)) {
      console.log(`Stopping ${name} (PID: ${pid})...`);
      try {
        if (isWin) {
          spawn('taskkill', ['/pid', pid, '/f', '/t']);
        } else {
          process.kill(pid, 'SIGTERM');
        }
      } catch (err) {
        console.error(`Error stopping ${name}: ${err.message}`);
      }
    }

    // Wait for processes to exit
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Remove PID file
    fs.unlinkSync(PID_FILE);
    
    console.log('✅ All processes stopped');
  }
}

// CLI
const command = process.argv[2];
const mode = process.argv[3] || 'dev';

(async () => {
  switch (command) {
    case 'start':
      const monitor = new ProcessMonitor(mode);
      await monitor.start();
      break;
    
    case 'stop':
      await ProcessMonitor.stop();
      break;
    
    case 'status':
      ProcessMonitor.status();
      break;
    
    default:
      console.log(`
Usage: node scripts/monitor.js <command> [mode]

Commands:
  start [dev|prod]  - Start processes with monitoring (default: dev)
  stop              - Stop all processes
  status            - Show process status

Examples:
  node scripts/monitor.js start
  node scripts/monitor.js start prod
  node scripts/monitor.js stop
  node scripts/monitor.js status
      `);
  }
})();
