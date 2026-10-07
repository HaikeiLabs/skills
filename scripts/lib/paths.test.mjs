import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { resolveSkillsDir } from './paths.mjs';

test('resolves the default repo skills directory', () => {
  assert.equal(resolveSkillsDir(null, { root: '/repo' }), '/repo/skills');
});

test('resolves tilde paths and paths outside the repository skills folder', () => {
  assert.equal(resolveSkillsDir('~/code/other/skills', { root: '/repo', home: '/users/test' }),
    '/users/test/code/other/skills');
  assert.equal(resolveSkillsDir('kei/.agents/skills', { root: '/repo', cwd: '/repo', home: '/users/test' }),
    path.resolve('/repo/kei/.agents/skills'));
});
