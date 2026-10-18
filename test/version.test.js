import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

import { getVersion } from '../src/version.js';

const pkg = createRequire(import.meta.url)('../package.json');

describe('getVersion', () => {
  it('returns the package.json version', () => {
    assert.equal(getVersion(), pkg.version);
  });

  it('resolves package.json relative to the module, not the cwd', async () => {
    const originalCwd = process.cwd();
    const dir = await mkdtemp(join(tmpdir(), 'gjt-version-'));
    try {
      process.chdir(dir);
      assert.equal(getVersion(), pkg.version);
    } finally {
      process.chdir(originalCwd);
      await rm(dir, { recursive: true, force: true });
    }
  });
});
