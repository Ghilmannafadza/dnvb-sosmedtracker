// Menjalankan CLI lokal yang dipasang Agent Reach (opencli, twitter, rdt, bili, xhs, yt-dlp, gh,
// agent-reach) dengan aman: tanpa shell bila memungkinkan, batas waktu, batas paralel per CLI,
// dan pembacaan amplop JSON { ok, data } yang dipakai CLI-CLI tersebut.
// Di Vercel CLI ini tidak ada: semua pengecekan langsung bernilai "tidak tersedia".
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const WIN = process.platform === 'win32';
const binCache = new Map<string, { at: number; v: { cmd: string; pre: string[]; shell: boolean } | null }>();
/** CLI yang baru dipasang terdeteksi tanpa restart (cache 2 menit) */
const BIN_TTL = 120000;
export const clearBinCache = () => binCache.clear();

export const cliDisabled = () => process.env.REACH_LOCAL === '0' || Boolean(process.env.VERCEL);

/** Lokasi CLI. Shim .cmd npm di Windows diurai agar bisa dijalankan lewat node tanpa shell. */
export function resolveBin(name: string) {
  const hit = binCache.get(name);
  if (hit && Date.now() - hit.at < BIN_TTL) return hit.v;
  let out: { cmd: string; pre: string[]; shell: boolean } | null = null;
  if (!cliDisabled()) {
    try {
      const r = spawnSync(WIN ? 'where' : 'which', [name], { encoding: 'utf8', timeout: 4000, windowsHide: true });
      const lines = (r.stdout || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
      const path = WIN ? lines.find((l) => /\.(exe|cmd|bat)$/i.test(l)) || lines[0] : lines[0];
      if (r.status === 0 && path) {
        if (WIN && /\.(cmd|bat)$/i.test(path)) {
          const js = npmShimTarget(path);
          out = js ? { cmd: process.execPath, pre: [js], shell: false } : { cmd: path, pre: [], shell: true };
        } else out = { cmd: path, pre: [], shell: false };
      }
    } catch {
      out = null;
    }
  }
  binCache.set(name, { at: Date.now(), v: out });
  return out;
}

/** "%dp0%\node_modules\pkg\bin.js" di shim npm → path absolut skrip JS */
export function npmShimTarget(shimPath: string): string | null {
  try {
    const txt = readFileSync(shimPath, 'utf8');
    const m = txt.match(/"%~?dp0%?\\([^"]+\.(?:c|m)?js)"/i) || txt.match(/%dp0%\\([^"\s]+\.(?:c|m)?js)/i);
    if (!m) return null;
    const p = resolve(dirname(shimPath), m[1].replace(/\\/g, '/'));
    return existsSync(p) ? p : null;
  } catch {
    return null;
  }
}

export const hasBin = (name: string) => Boolean(resolveBin(name));

/** Argumen untuk shell Windows (hanya bila shim tidak bisa diurai): buang karakter berbahaya */
const shellSafe = (a: string) => `"${a.replace(/["%^&|<>!`\r\n]/g, ' ').trim()}"`;

/* ------------------------------ batas paralel ------------------------------ */
const LIMIT: Record<string, number> = { opencli: 1, twitter: 1, rdt: 1, xhs: 1 };
const running = new Map<string, number>();
const queue = new Map<string, (() => void)[]>();
async function acquire(name: string) {
  const max = LIMIT[name] ?? 2;
  if ((running.get(name) || 0) < max) {
    running.set(name, (running.get(name) || 0) + 1);
    return;
  }
  await new Promise<void>((r) => queue.set(name, [...(queue.get(name) || []), r]));
  running.set(name, (running.get(name) || 0) + 1);
}
function release(name: string) {
  running.set(name, Math.max(0, (running.get(name) || 1) - 1));
  const q = queue.get(name) || [];
  const next = q.shift();
  queue.set(name, q);
  next?.();
}

export interface CliResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export async function runCli(name: string, args: string[], opts: { timeoutMs?: number; env?: Record<string, string> } = {}): Promise<CliResult> {
  const bin = resolveBin(name);
  if (!bin) throw new Error(`${name} belum terpasang`);
  await acquire(name);
  try {
    return await new Promise<CliResult>((done) => {
      const argv = [...bin.pre, ...(bin.shell ? args.map(shellSafe) : args)];
      const child = spawn(bin.cmd, argv, {
        shell: bin.shell,
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', NO_COLOR: '1', OUTPUT: 'json', ...(opts.env || {}) },
      });
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      const t = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, opts.timeoutMs ?? 40000);
      child.stdout.on('data', (d) => (stdout = (stdout + d).slice(-4_000_000)));
      child.stderr.on('data', (d) => (stderr = (stderr + d).slice(-20000)));
      child.on('error', (e) => {
        clearTimeout(t);
        done({ code: -1, stdout, stderr: stderr + String(e.message), timedOut });
      });
      child.on('close', (code) => {
        clearTimeout(t);
        done({ code, stdout, stderr, timedOut });
      });
    });
  } finally {
    release(name);
  }
}

/** Ambil JSON dari stdout (boleh ada teks lain sebelum/sesudahnya). */
export function parseJsonOut(stdout: string): any {
  const s = stdout.trim();
  try {
    return JSON.parse(s);
  } catch {
    /* lanjut */
  }
  // JSON Lines (yt-dlp --dump-json)
  const lines = s.split(/\r?\n/).filter((l) => /^\s*[{[]/.test(l));
  if (lines.length > 1) {
    try {
      return lines.map((l) => JSON.parse(l));
    } catch {
      /* lanjut */
    }
  }
  const a = s.search(/[{[]/);
  if (a >= 0) {
    const close = s[a] === '{' ? '}' : ']';
    let end = s.lastIndexOf(close);
    while (end > a) {
      try {
        return JSON.parse(s.slice(a, end + 1));
      } catch {
        end = s.lastIndexOf(close, end - 1);
      }
    }
  }
  throw new Error('Keluaran CLI bukan JSON');
}

/** Amplop { ok, data } / { ok:false, error } (OpenCLI, twitter-cli, rdt-cli, bili, xhs) → data */
export function unwrap(out: any): any {
  if (out && typeof out === 'object' && !Array.isArray(out) && 'ok' in out) {
    if (out.ok === false) {
      const e = out.error || {};
      throw new Error([e.code, e.message, e.hint].filter(Boolean).join(': ') || 'CLI gagal');
    }
    return out.data;
  }
  return out;
}

export async function cliJson(name: string, args: string[], opts: { timeoutMs?: number; env?: Record<string, string> } = {}) {
  const r = await runCli(name, args, opts);
  if (r.timedOut) throw new Error(`${name}: batas waktu habis`);
  let parsed: any;
  try {
    parsed = parseJsonOut(r.stdout);
  } catch {
    const msg = (r.stderr || r.stdout).trim().split(/\r?\n/).slice(-3).join(' ').slice(0, 240);
    throw new Error(`${name} gagal (kode ${r.code}): ${msg || 'tanpa keluaran'}`);
  }
  return unwrap(parsed);
}
