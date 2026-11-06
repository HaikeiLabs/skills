/**
 * Standalone checker for banned wording in the Haikei skills repo.
 *
 * Same standalone style as scripts/check-agentware-pins.mjs and
 * scripts/verify-skills.mjs: node builtins only, shared frontmatter regex.
 *
 * Contract C1 (2026-11-06) bans the governance wording family in skill and
 * doc bodies. The product noun for deterministic tool-call guardrails is
 * "Kei policies"; a call routed through kei-proxy is a "protected tool call";
 * a connector whose reads Kei decides is "a connector Kei checks". The words
 * below must not appear as whole words in body prose:
 *
 *   governed / governance / governs / ungoverned
 *
 * The checker strips, per file:
 *   - frontmatter (descriptions keep pre-existing wording by design),
 *   - fenced code blocks (``` / ~~~), including their content,
 *   - inline code spans (`...`) — backticked tag identifiers such as
 *     `governed-connector` and quoted error strings stay as-is.
 *
 * It scans every .md file outside evals/, benchmark-results/, node_modules
 * and .git, and exits non-zero listing every surviving occurrence with file,
 * line, and the matched word.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

// Banned governance wording, whole words only (contract C1).
const BANNED_WORD = /\b(governed|governance|governs|ungoverned)\b/gi;

// Inline code spans on one line; replaced with same-length spaces so column
// and line numbers stay stable.
const INLINE_CODE = /`[^`\n]*`/g;

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;

// Trees never scanned: eval fixtures and results, and non-source dirs.
const SKIP_DIRS = ['evals', 'benchmark-results', 'node_modules', '.git'];

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    if (SKIP_DIRS.includes(entry)) continue;
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      files.push(...walk(full));
    } else if (stat.isFile()) {
      files.push(full);
    }
  }
  return files;
}

/** Strip frontmatter; report the body's first line number (1-based). */
function bodyWithStart(raw) {
  const match = FRONTMATTER.exec(raw);
  if (!match) return { text: raw, startLine: 1 };
  return {
    text: raw.slice(match[0].length),
    startLine: match[0].split(/\r?\n/).length,
  };
}

const scanned = [];
const violations = [];

for (const file of walk(ROOT).sort()) {
  const rel = relative(ROOT, file);
  if (!rel.endsWith('.md')) continue;
  scanned.push(rel);

  const raw = readFileSync(file, 'utf8');
  const { text, startLine } = bodyWithStart(raw);
  const lines = text.split(/\r?\n/);

  let inFence = false;
  let fenceChar = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceOpen = FENCE.exec(line);
    if (fenceOpen) {
      const char = fenceOpen[1][0];
      if (!inFence) {
        inFence = true;
        fenceChar = char;
      } else if (char === fenceChar) {
        inFence = false;
        fenceChar = null;
      }
      continue;
    }
    if (inFence) continue;

    const prose = line.replace(INLINE_CODE, (span) => ' '.repeat(span.length));
    BANNED_WORD.lastIndex = 0;
    let match;
    while ((match = BANNED_WORD.exec(prose)) !== null) {
      violations.push(
        `${rel}:${startLine + i}: banned word "${match[1]}" in body prose\n` +
        `    ${line.trim()}`
      );
    }
  }
}

if (violations.length > 0) {
  process.stderr.write(
    `check-language: ${violations.length} banned word(s) in body prose\n\n` +
    violations.join('\n\n') + '\n\n' +
    `Contract C1: write "Kei policies" (not Kei governance), ` +
    `"protected tool call" (not governed tool call), and ` +
    `"a connector Kei checks" (not governed connector). ` +
    `Frontmatter, fenced code, and backticked identifiers are out of scope.\n`
  );
  process.exit(1);
}

process.stdout.write(
  `language verified: ${scanned.length} markdown files scanned, ` +
  `no banned wording in body prose\n`
);
