#!/usr/bin/env node
// @ts-nocheck
/*
 Orchestrator script to build and run both server and client.
 Modes:
  - dev   : runs server (ts-node-dev) and client (vite dev) with autorestart
  - prod  : builds server and client, then runs server (node dist) and client (vite preview)
  - e2e   : like dev but sets SKIP_SECURITY=1 and RECONNECT_GRACE_MS for tests
  - stop  : stops previously started processes
  - status: prints status of managed processes

 Usage:
   node scripts/orchestrator.js dev|prod|e2e|stop|status [--force]
*/

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const net = require('net');

const ROOT = path.resolve(__dirname, '..');
const SERVER_CWD = path.join(ROOT, 'server');
const CLIENT_CWD = path.join(ROOT, 'client');
const STATE_FILE = path.join(__dirname, '.orchestrator-state.json');

const DEFAULT_PORTS = { server: 3001, client: 5173 };
const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';

// Derive defaults for socket URL and client origin if not provided via env
const SOCKET_URL = process.env.VITE_SOCKET_URL || `http://localhost:${DEFAULT_PORTS.server}`;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || `http://localhost:${DEFAULT_PORTS.client}`;

function logp(prefix, msg) {
  const time = new Date().toISOString().split('T')[1].replace('Z','');
  process.stdout.write(`[${time}] [${prefix}] ${msg}`);
}

function checkPortFree(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', (err) => {
      if (err.code === 'EADDRINUSE') resolve(false);
      else resolve(false);
    });
    srv.once('listening', () => {
      srv.close(() => resolve(true));
    });
    srv.listen(port, host);
  });
}

function isPidRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}
function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function prefixChild(child, prefix) {
  if (child.stdout) child.stdout.on('data', d => logp(prefix, d.toString()));
  if (child.stderr) child.stderr.on('data', d => logp(prefix, d.toString()));
}

function spawnManaged(name, cmd, args, cwd, env, state, autoRestart = true) {
  // On Windows, use shell:true so npm.cmd is resolved properly; use stdio: 'inherit' to avoid EINVAL issues
  const spawnOpts = { cwd, env: { ...process.env, ...env }, stdio: 'inherit', shell: isWin };
  const child = spawn(cmd, args, spawnOpts);
  // When using stdio: 'inherit', child.stdout/err are null; keep prefixChild only if available
  if (child.stdout || child.stderr) {
    prefixChild(child, name);
  }
  state.processes = state.processes || {};
  state.processes[name] = { pid: child.pid, cmd: [cmd, ...args].join(' '), cwd };
  saveState(state);

  child.on('exit', (code, signal) => {
    logp(name, `exited with code ${code} signal ${signal}\n`);
    // Remove PID
    const s = loadState();
    if (s.processes && s.processes[name] && s.processes[name].pid === child.pid) {
      delete s.processes[name];
      saveState(s);
    }
    if (autoRestart && !state._stopping) {
      logp(name, 'restarting in 2s...\n');
      setTimeout(() => spawnManaged(name, cmd, args, cwd, env, state, autoRestart), 2000);
    }
  });

  return child;
}

async function ensurePortsFree(ports, force) {
  for (const [role, port] of Object.entries(ports)) {
    const free = await checkPortFree(port);
    if (!free && !force) {
      throw new Error(`Port ${port} for ${role} is in use. Re-run with --force or free the port.`);
    }
  }
}

async function findFreePort(start, attempts = 15) {
  let p = start;
  for (let i = 0; i < attempts; i++, p++) {
    if (await checkPortFree(p)) return p;
  }
  // As a last resort, return the starting port (let the child fail and auto-restart)
  return start;
}

async function computePorts(force) {
  let serverPort = DEFAULT_PORTS.server;
  let clientPort = DEFAULT_PORTS.client;
  const serverFree = await checkPortFree(serverPort);
  const clientFree = await checkPortFree(clientPort);
  if (!serverFree && force) serverPort = await findFreePort(serverPort + 1);
  if (!clientFree && force) clientPort = await findFreePort(clientPort + 1);
  return { serverPort, clientPort };
}

async function cmdDev(force) {
  await ensurePortsFree(DEFAULT_PORTS, force);
  const { serverPort, clientPort } = await computePorts(force);
  const state = loadState();
  state.mode = 'dev';
  state._stopping = false;
  saveState(state);

  const clientOrigin = process.env.CLIENT_ORIGIN || `http://localhost:${clientPort}`;
  const socketUrl = process.env.VITE_SOCKET_URL || `http://localhost:${serverPort}`;
  // Ensure server sees correct client origin for CORS and correct PORT; client sees socket URL and fixed port
  spawnManaged('server', npmCmd, ['run', 'dev'], SERVER_CWD, { PORT: String(serverPort), CORS_ORIGIN: clientOrigin }, state, true);
  spawnManaged('client', npmCmd, ['run', 'dev', '--', '--strictPort', '--port', String(clientPort)], CLIENT_CWD, { VITE_SOCKET_URL: socketUrl }, state, true);
}

async function cmdE2E(force) {
  await ensurePortsFree(DEFAULT_PORTS, force);
  const { serverPort, clientPort } = await computePorts(force);
  const state = loadState();
  state.mode = 'e2e';
  state._stopping = false;
  saveState(state);

  const clientOrigin = process.env.CLIENT_ORIGIN || `http://localhost:${clientPort}`;
  const socketUrl = process.env.VITE_SOCKET_URL || `http://localhost:${serverPort}`;
  const serverEnv = { SKIP_SECURITY: '1', RECONNECT_GRACE_MS: '1000', CORS_ORIGIN: clientOrigin, PORT: String(serverPort) };
  spawnManaged('server', npmCmd, ['run', 'dev'], SERVER_CWD, serverEnv, state, true);
  const clientEnv = { VITE_E2E_TEST: '1', VITE_SOCKET_URL: socketUrl };
  spawnManaged('client', npmCmd, ['run', 'dev', '--', '--strictPort', '--port', String(clientPort)], CLIENT_CWD, clientEnv, state, true);
}

async function runBuild(socketUrl) {
  await new Promise((resolve, reject) => {
    const p = spawn(npmCmd, ['run', 'build'], { cwd: SERVER_CWD, stdio: 'inherit' });
    p.on('exit', code => code === 0 ? resolve() : reject(new Error('server build failed')));
  });
  await new Promise((resolve, reject) => {
    // Ensure VITE_SOCKET_URL is baked into the production build
    const p = spawn(npmCmd, ['run', 'build'], { cwd: CLIENT_CWD, stdio: 'inherit', env: { ...process.env, VITE_SOCKET_URL: socketUrl } });
    p.on('exit', code => code === 0 ? resolve() : reject(new Error('client build failed')));
  });
}

async function cmdProd(force) {
  await ensurePortsFree(DEFAULT_PORTS, force);
  const { serverPort, clientPort } = await computePorts(force);
  const clientOrigin = process.env.CLIENT_ORIGIN || `http://localhost:${clientPort}`;
  const socketUrl = process.env.VITE_SOCKET_URL || `http://localhost:${serverPort}`;
  await runBuild(socketUrl);
  const state = loadState();
  state.mode = 'prod';
  state._stopping = false;
  saveState(state);

  // Provide sensible defaults; can be overridden by environment
  spawnManaged('server', npmCmd, ['run', 'start'], SERVER_CWD, { CORS_ORIGIN: clientOrigin, PORT: String(serverPort) }, state, true);
  spawnManaged('client', npmCmd, ['run', 'preview', '--', '--port', String(clientPort), '--strictPort'], CLIENT_CWD, {}, state, true);
}

async function cmdStop() {
  const state = loadState();
  state._stopping = true;
  saveState(state);
  if (!state.processes || Object.keys(state.processes).length === 0) {
    console.log('No managed processes found.');
    return;
  }
  for (const [name, info] of Object.entries(state.processes)) {
    const pid = info.pid;
    if (pid && isPidRunning(pid)) {
      try {
        process.kill(pid, 'SIGTERM');
        await new Promise(r => setTimeout(r, 500));
      } catch {}
      if (isPidRunning(pid)) {
        if (isWin) {
          await new Promise((resolve) => {
            const tk = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'inherit' });
            tk.on('exit', () => resolve());
          });
        } else {
          try { process.kill(pid, 'SIGKILL'); } catch {}
        }
      }
    }
    logp('orchestrator', `stopped ${name} (pid ${pid})\n`);
  }
  saveState({});
}

async function cmdStatus() {
  const state = loadState();
  if (!state.processes) {
    console.log('No managed processes.');
    return;
  }
  console.log(`Mode: ${state.mode || 'n/a'}`);
  for (const [name, info] of Object.entries(state.processes)) {
    const alive = info.pid && isPidRunning(info.pid);
    console.log(`${name}: pid=${info.pid} alive=${alive} cwd=${info.cwd}\n  cmd: ${info.cmd}`);
  }
}

(async () => {
  const [, , mode, ...rest] = process.argv;
  const force = rest.includes('--force');
  try {
    switch (mode) {
      case 'dev':
        await cmdDev(force); break;
      case 'e2e':
        await cmdE2E(force); break;
      case 'prod':
        await cmdProd(force); break;
      case 'stop':
        await cmdStop(); break;
      case 'status':
        await cmdStatus(); break;
      default:
        console.log('Usage: node scripts/orchestrator.js <dev|prod|e2e|stop|status> [--force]');
    }
  } catch (err) {
    console.error('[orchestrator] Error:', err.message || err);
    process.exit(1);
  }
})();
