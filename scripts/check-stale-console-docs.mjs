/** Fail if repository files link to the retired in-console docs. */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Keep the retired URL split so this guard does not match itself.
const STALE_URL = ['app.haikeilabs.com/', '#/docs'].join('');

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules') continue;
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

const matches = [];
for (const file of walk(ROOT)) {
  const contents = readFileSync(file);
  if (contents.includes(0)) continue;
  if (contents.toString('utf8').includes(STALE_URL)) matches.push(relative(ROOT, file));
}

if (matches.length) {
  for (const file of matches) process.stderr.write(`check-stale-console-docs: retired docs URL in ${file}\n`);
  process.exit(1);
}
process.stdout.write('no retired in-console docs URLs found\n');
