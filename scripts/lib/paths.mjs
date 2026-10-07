import os from 'node:os';
import path from 'node:path';

export function resolveSkillsDir(value, { root, home = os.homedir(), cwd = process.cwd() }) {
  if (!value) return path.resolve(root, 'skills');
  const expanded = value === '~' ? home : value.startsWith('~/') ? path.join(home, value.slice(2)) : value;
  return path.resolve(cwd, expanded);
}
