/**
 * Standalone checker for Agentware version pins in the Haikei skills repo.
 *
 * Adapted from scripts/verify-skills.mjs (same standalone style: node
 * builtins only, shared frontmatter regex).
 *
 * AGENTWARE_CURRENT is the single source of truth for the current Agentware
 * release quoted in prose (contract C6: the agentware VERSION file and the
 * README compatibility table are canonical). Bump it when Agentware ships a
 * new release, then fix the flagged lines.
 *
 * Scans every SKILL.md under skills/ and every README.md in the repo,
 * skipping frontmatter, evals/ and benchmark-results/ trees.
 *
 * A body line fails when it pins an Agentware version — prose "Agentware
 * X.Y.Z" / "agentware SDK X.Y.Z", an `@haikeilabs/agentware@x.y.z` npm pin, a
 * `haikeilabs-agentware==x.y.z` pip pin, or a `github.com/haikeilabs/agentware/go`
 * Go module pin — that is not AGENTWARE_CURRENT, and the line carries no
 * feature-floor marker ("from", "or later", ">=", "Starting in", "Since"). Per
 * contract C6, feature floors are written "from X" or "X or later".
 *
 * Exits non-zero when a stale pin survives; prints a summary line on success.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

// The current Agentware release in prose. Contract C6 source of truth
// (0.16.0 as of 2026-11-05; kei-proxy v0.6.5, kei-cli 0.3.6).
const AGENTWARE_CURRENT = '0.16.0';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

// A version tied to Agentware on the same line:
//   - prose: "Agentware 0.16.0", "agentware SDK 0.4.0", "agentware >= 0.11.0",
//     "haikeilabs-agentware==0.11.0" (the word boundary matches the package
//     tail after the hyphen)
//   - npm:   "@haikeilabs/agentware@0.11.0"
//   - Go:    "github.com/haikeilabs/agentware/go@v0.11.0" or ".../go v0.11.0"
const VERSION_PATTERNS = [
  /\bagentware(?:\s+sdk)?\s*\(?\s*(?:[><=~^]+\s*)?v?(\d+\.\d+\.\d+)\b/gi,
  /@haikeilabs\/agentware@v?(\d+\.\d+\.\d+)\b/gi,
  /haikeilabs\/agentware\/go(?:@|\s+)v?(\d+\.\d+\.\d+)\b/gi,
];

// Feature-floor markers; a line carrying one may cite an older version (C6).
// "Since" is maintainer-approved: "Since agentware SDK 0.4.0" reads as a floor.
const FLOOR_MARKERS = /\bfrom\b|\bor later\b|>=|\bstarting in\b|\bsince\b/i;

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

function isScanned(relPath) {
  const parts = relPath.split(sep);
  const base = parts[parts.length - 1];
  if (base === 'SKILL.md') return parts[0] === 'skills';
  if (base === 'README.md') return true;
  return false;
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
  if (!isScanned(rel)) continue;
  scanned.push(rel);

  const raw = readFileSync(file, 'utf8');
  const { text, startLine } = bodyWithStart(raw);
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const versions = [];
    for (const pattern of VERSION_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(line)) !== null) {
        versions.push(match[1]);
      }
    }
    if (versions.length === 0) continue;
    if (FLOOR_MARKERS.test(line)) continue;
    for (const version of new Set(versions.filter((v) => v !== AGENTWARE_CURRENT))) {
      violations.push(
        `${rel}:${startLine + i}: Agentware version ${version} is not the ` +
        `current ${AGENTWARE_CURRENT} and the line has no feature-floor ` +
        `marker ("from", "or later", ">=", "Starting in", "Since")\n` +
        `    ${line.trim()}`
      );
    }
  }
}

if (violations.length > 0) {
  process.stderr.write(
    `check-agentware-pins: ${violations.length} stale Agentware pin(s) ` +
    `(current: ${AGENTWARE_CURRENT})\n\n` +
    violations.join('\n\n') + '\n\n' +
    `Fix the version, or write the line as a feature floor per contract C6 ` +
    `("from Agentware X" or "X or later").\n`
  );
  process.exit(1);
}

process.stdout.write(
  `agentware pins verified: ${scanned.length} files scanned, ` +
  `current Agentware ${AGENTWARE_CURRENT}\n`
);
