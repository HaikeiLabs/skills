import { spawn } from 'node:child_process';

export const DEFAULT_RUN_TIMEOUT_SECONDS = 600;

// Read one profile from evals/model-profiles.yaml. The file is a flat
// two-level map, so each `    key: value` line under `  <name>:` is a field;
// comments and blank lines are skipped.
export function parseModelProfile(yamlText, name) {
  const lines = yamlText.split('\n');
  const start = lines.findIndex((line) => line === `  ${name}:`);
  if (start < 0) return null;
  const fields = {};
  for (const line of lines.slice(start + 1)) {
    if (/^\s*(#.*)?$/.test(line)) continue;
    const match = line.match(/^ {4}([a-z_]+):\s*(\S+)\s*$/);
    if (!match) break;
    fields[match[1]] = match[2];
  }
  if (!fields.opencode_model) return null;
  const timeout = fields.run_timeout_seconds;
  return {
    model: fields.opencode_model,
    baseUrlEnv: fields.base_url_env,
    runTimeoutSeconds: timeout === undefined ? undefined : positiveSeconds(timeout, `${name}.run_timeout_seconds`),
    temperature: fields.temperature === undefined ? undefined : temperature(fields.temperature, `${name}.temperature`),
    topP: fields.top_p === undefined ? undefined : topP(fields.top_p, `${name}.top_p`),
    topK: fields.top_k === undefined ? undefined : topK(fields.top_k, `${name}.top_k`),
    seed: fields.seed === undefined ? undefined : seed(fields.seed, `${name}.seed`),
    thinking: fields.thinking === undefined ? undefined : bool(fields.thinking, `${name}.thinking`),
  };
}

function bool(value, label) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${label} must be true or false`);
}

function temperature(value, label) {
  const t = Number(value);
  if (!Number.isFinite(t) || t < 0) throw new Error(`${label} must be a number >= 0`);
  return t;
}

function topP(value, label) {
  const p = Number(value);
  if (!Number.isFinite(p) || p <= 0 || p > 1) throw new Error(`${label} must be a number in (0, 1]`);
  return p;
}

function topK(value, label) {
  const k = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(k) || k < 1) throw new Error(`${label} must be a positive integer`);
  return k;
}

function seed(value, label) {
  const s = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(s)) throw new Error(`${label} must be a non-negative integer`);
  return s;
}

// --run-timeout wins over the profile's run_timeout_seconds, which wins over
// the default.
export function resolveRunTimeoutSeconds({ flag, profile } = {}) {
  if (flag !== undefined && flag !== null) return positiveSeconds(flag, '--run-timeout');
  if (profile !== undefined && profile !== null) return profile;
  return DEFAULT_RUN_TIMEOUT_SECONDS;
}

function positiveSeconds(value, label) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`${label} must be a positive number of seconds`);
  return seconds;
}

// Run a harness command. A run still going after timeoutMs gets SIGTERM and
// resolves with timedOut: true (its exit code is then null, killed by signal).
// The command runs in its own process group and the whole group is signalled,
// so subprocesses the harness started cannot hold the output pipes open and
// keep the run alive past the timeout.
export function runCommand(cmd, args, { cwd, timeoutMs, env = {} }) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32' });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGTERM');
      } catch {
        child.kill('SIGTERM');
      }
    }, timeoutMs);
    child.on('error', (err) => { clearTimeout(timer); resolve({ code: -1, stdout, stderr: String(err), ms: Date.now() - started, timedOut }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr, ms: Date.now() - started, timedOut }); });
  });
}

export function timingRecord(res, timeoutSeconds) {
  return { total_duration_seconds: res.ms / 1000, exit_code: res.code,
    timed_out: Boolean(res.timedOut), timeout_seconds: timeoutSeconds };
}

// Terminal escape sequences (opencode colours its step lines).
const ANSI = /\u001b\[[0-9;?]*[ -\/]*[@-~]/g;

export function stripAnsi(text) {
  return String(text ?? '').replace(ANSI, '');
}

function lastLine(text) {
  return stripAnsi(text).split('\n').map((line) => line.trim()).filter(Boolean).pop() ?? null;
}

// The error to report for a run that did not finish: killed at the timeout
// (exactly "timeout") or a non-zero exit (the exit code and stderr's last
// line). null when the harness exited cleanly, even with an empty answer:
// that is the model's outcome, which noAnswer() grades as a failed run.
export function runError(res) {
  if (res.timedOut) return 'timeout';
  if (res.code !== 0) {
    const line = lastLine(res.stderr);
    return line ? `exit ${res.code}: ${line}` : `exit ${res.code}`;
  }
  return null;
}

// The failure reason for a clean exit with no answer text, or null when there
// is an answer. stderr's last line is opencode's last step, e.g. the skill it
// loaded before the model stopped.
export function noAnswer(res, response) {
  if (res.timedOut || res.code !== 0 || response.trim()) return null;
  const line = lastLine(res.stderr);
  return line ? `no answer (the run ended after: ${line})` : 'no answer';
}

export function timeoutSummary(results, timeoutSeconds) {
  const count = results.filter((r) => r.timedOut).length;
  if (!count) return null;
  return `${count} run${count === 1 ? '' : 's'} timed out after ${timeoutSeconds}s`;
}
