#!/usr/bin/env node

import fs from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createInterface } from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

// Get the vite executable path from local node_modules
const getViteExecutable = () => {
  const viteExe = process.platform === 'win32'
    ? join(projectRoot, 'node_modules', '.bin', 'vite.cmd')
    : join(projectRoot, 'node_modules', '.bin', 'vite');
  // Verify vite exists before attempting to spawn
  if (!fs.existsSync(viteExe)) {
    console.error(`✗ Vite executable not found at ${viteExe}. Run 'npm install' to install dependencies.`);
    process.exit(1);
  }
  return viteExe;
};

// Helper to safely kill vite process (handles process groups on Unix, ignores already-dead processes)
const killViteProcess = (viteProc, signal = 'SIGTERM') => {
  if (!viteProc?.pid) return;  // Process not initialized or already gone
  try {
    if (process.platform !== 'win32') {
      process.kill(-viteProc.pid, signal);  // Kill entire process group on Unix
    } else {
      viteProc.kill(signal);  // Direct kill on Windows
    }
  } catch (error) {
    // ESRCH = process not found (normal when already exited)
    if (error.code !== 'ESRCH') {
      console.error(`Warning: Failed to kill vite process: ${error.message}`);
    }
  }
};

// Start HTML builder with watch mode
console.log('🚀 Starting dev environment…\n');
const buildProcess = spawn('node', [join(__dirname, 'build-html.js'), '--watch'], {
  stdio: ['inherit', 'pipe', 'pipe']
});

let viteProcess;
let viteStartTimeout;

// Allow overriding the startup timeout via environment variable, defaulting to 5000 ms
const getViteStartTimeout = () => {
  const raw = process.env.VITE_START_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : 5000;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5000;
};
const viteStartTimeoutMs = getViteStartTimeout();

const cleanupAndExit = (exitCode) => {
  if (viteStartTimeout) {
    clearTimeout(viteStartTimeout);
    viteStartTimeout = null;
  }
  // Best-effort cleanup of spawned processes and readline interface
  if (viteProcess) {
    killViteProcess(viteProcess);
  }
  if (buildProcess && !buildProcess.killed) {
    try {
      buildProcess.kill();
    } catch (_) {
      // ignore errors if process already exited
    }
  }
  if (lineReader) {
    lineReader.close();
  }
  process.exit(exitCode);
};

// Use readline to process stdout line-by-line for reliable startup detection
const lineReader = createInterface({
  input: buildProcess.stdout,
  crlfDelay: Infinity // Handle both \n and \r\n line endings
});

// Fallback: if the builder neither exits nor prints the ready sentinel within the timeout, abort
viteStartTimeout = setTimeout(() => {
  if (!viteProcess) {
    console.error(`✗ Vite failed to start within ${viteStartTimeoutMs} ms. Check builder output above.`);
    cleanupAndExit(1);
  }
}, viteStartTimeoutMs);

// Pipe all output to stdout immediately
buildProcess.stdout.on('data', (data) => {
  process.stdout.write(data);
});

// Process each complete line to detect when builder is ready.
// Sentinel: build-html.js logs "Watching …" once the initial build succeeds and watch mode starts.
lineReader.on('line', (line) => {
  if (line.includes('Watching') && !viteProcess) {
    clearTimeout(viteStartTimeout);
    // Spawn vite directly to avoid npm signal propagation issues
    const spawnOptions = {
      stdio: 'inherit',
      shell: process.platform === 'win32' // Use shell on Windows for better signal handling
    };

    // On non-Windows, detach the process into its own group for reliable cleanup
    if (process.platform !== 'win32') {
      spawnOptions.detached = true;
    }

    viteProcess = spawn(getViteExecutable(), ['dev'], spawnOptions);
    viteProcess.on('error', (err) => {
      console.error(`✗ Failed to start Vite: ${err.message}`);
      cleanupAndExit(1);
    });
  }
});

// If the builder exits, handle it whether or not Vite has started
buildProcess.on('exit', (code, signal) => {
  // Always clear the startup timeout once the builder exits
  clearTimeout(viteStartTimeout);
  lineReader.close();
  const exitCode = (typeof code === 'number' && code !== 0) ? code : 1;
  const signalInfo = signal ? ` (signal ${signal})` : '';
  // Kill Vite if it was started, then exit with the builder's code
  if (viteProcess) {
    killViteProcess(viteProcess);
    console.error(`✗ HTML builder exited with code ${exitCode}${signalInfo} after Vite started.`);
  } else {
    console.error(`✗ HTML builder exited with code ${exitCode}${signalInfo} before Vite could start.`);
  }
  process.exit(exitCode);
});

buildProcess.stderr.on('data', (data) => {
  process.stderr.write(data);
});

// Handle process termination
const terminate = () => {
  console.log('\n📴 Shutting down…');
  clearTimeout(viteStartTimeout);
  lineReader.close();
  buildProcess.kill();
  killViteProcess(viteProcess);
  process.exit(0);
};

process.on('SIGINT', terminate);
process.on('SIGTERM', terminate);

buildProcess.on('error', (err) => {
  console.error('✗ Failed to start HTML builder:', err.message);
  process.exit(1);
});

