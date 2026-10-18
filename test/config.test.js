import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  CONFIG_SECTION,
  configKey,
  formatMissing,
  missingRequired,
  resolveConfig,
} from '../src/config.js';

function git(args, { cwd, env }) {
  return new Promise((resolveResult) => {
    execFile('git', args, { cwd, env }, (error, stdout, stderr) => {
      resolveResult({ code: error ? error.code ?? 1 : 0, stdout, stderr });
    });
  });
}

async function withRepo(run) {
  const root = await mkdtemp(join(tmpdir(), 'gjt-config-'));
  const home = join(root, 'home');
  const repo = join(root, 'repo');
  const outside = join(root, 'outside');
  await mkdir(home, { recursive: true });
  await mkdir(repo, { recursive: true });
  await mkdir(outside, { recursive: true });

  const env = {
    HOME: home,
    XDG_CONFIG_HOME: join(home, '.config'),
    GIT_CONFIG_NOSYSTEM: '1',
    PATH: process.env.PATH,
  };

  await git(['init', '-q'], { cwd: repo, env });

  try {
    await run({ root, home, repo, outside, env });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function setGlobal(env, key, value) {
  return git(['config', '--global', key, value], { cwd: env.HOME, env });
}

function setLocal(repo, env, key, value) {
  return git(['config', '--local', key, value], { cwd: repo, env });
}

describe('configKey', () => {
  it('builds a full key from a field name', () => {
    assert.equal(CONFIG_SECTION, 'jira-fast-ticket');
    assert.equal(configKey('url'), 'jira-fast-ticket.url');
    assert.equal(configKey('email'), 'jira-fast-ticket.email');
    assert.equal(configKey('token'), 'jira-fast-ticket.token');
  });
});

describe('resolveConfig', () => {
  it('lets the environment win over local git config', async () => {
    await withRepo(async ({ repo, env }) => {
      await setLocal(repo, env, 'jira-fast-ticket.url', 'https://local.example');

      const config = await resolveConfig({
        env: { ...env, JIRA_URL: 'https://env.example' },
        cwd: repo,
      });

      assert.equal(config.url, 'https://env.example');
      assert.equal(config.sources.JIRA_URL, 'env');
    });
  });

  it('lets local git config win over global', async () => {
    await withRepo(async ({ repo, env }) => {
      await setGlobal(env, 'jira-fast-ticket.email', 'global@example.com');
      await setLocal(repo, env, 'jira-fast-ticket.email', 'local@example.com');

      const config = await resolveConfig({ env, cwd: repo });

      assert.equal(config.email, 'local@example.com');
      assert.equal(config.sources.JIRA_EMAIL, 'local');
    });
  });

  it('uses global git config when there is no local value', async () => {
    await withRepo(async ({ repo, env }) => {
      await setGlobal(env, 'jira-fast-ticket.url', 'https://global.example');

      const config = await resolveConfig({ env, cwd: repo });

      assert.equal(config.url, 'https://global.example');
      assert.equal(config.sources.JIRA_URL, 'global');
    });
  });

  it('maps the token key to the pat field', async () => {
    await withRepo(async ({ repo, env }) => {
      await setGlobal(env, 'jira-fast-ticket.token', 'global-pat');

      const config = await resolveConfig({ env, cwd: repo });

      assert.equal(config.pat, 'global-pat');
      assert.equal(config.sources.JIRA_PAT, 'global');
    });
  });

  it('reports an undefined source for an unset key', async () => {
    await withRepo(async ({ repo, env }) => {
      const config = await resolveConfig({ env, cwd: repo });

      assert.equal(config.url, undefined);
      assert.equal(config.email, undefined);
      assert.equal(config.pat, undefined);
      assert.equal(config.sources.JIRA_URL, undefined);
      assert.equal(config.sources.JIRA_EMAIL, undefined);
      assert.equal(config.sources.JIRA_PAT, undefined);
    });
  });

  it('does not let an empty environment variable mask a git config value', async () => {
    await withRepo(async ({ repo, env }) => {
      await setLocal(repo, env, 'jira-fast-ticket.url', 'https://local.example');

      const config = await resolveConfig({ env: { ...env, JIRA_URL: '' }, cwd: repo });

      assert.equal(config.url, 'https://local.example');
      assert.equal(config.sources.JIRA_URL, 'local');
    });
  });

  it('reads global values without throwing when not inside a repository', async () => {
    await withRepo(async ({ outside, env }) => {
      await setGlobal(env, 'jira-fast-ticket.url', 'https://global.example');

      const config = await resolveConfig({ env, cwd: outside });

      assert.equal(config.url, 'https://global.example');
      assert.equal(config.sources.JIRA_URL, 'global');
    });
  });

  it('reports unset keys without throwing when not inside a repository', async () => {
    await withRepo(async ({ outside, env }) => {
      const config = await resolveConfig({ env, cwd: outside });

      assert.equal(config.url, undefined);
      assert.equal(config.sources.JIRA_URL, undefined);
    });
  });
});

describe('missingRequired', () => {
  it('names only the unresolved keys in order', () => {
    const config = {
      sources: { JIRA_URL: 'env', JIRA_EMAIL: undefined, JIRA_PAT: 'global' },
    };

    assert.deepEqual(missingRequired(config), ['JIRA_EMAIL']);
  });

  it('names all keys when nothing is resolved', () => {
    const config = {
      sources: { JIRA_URL: undefined, JIRA_EMAIL: undefined, JIRA_PAT: undefined },
    };

    assert.deepEqual(missingRequired(config), ['JIRA_URL', 'JIRA_EMAIL', 'JIRA_PAT']);
  });
});

describe('formatMissing', () => {
  it('names only the missing keys and prints the exact commands', () => {
    const message = formatMissing(['JIRA_EMAIL', 'JIRA_PAT']);

    assert.match(message, /Missing required configuration: JIRA_EMAIL, JIRA_PAT\./);
    assert.match(message, /git config --global jira-fast-ticket\.email <value>/);
    assert.match(message, /git config --global jira-fast-ticket\.token <value>/);
    assert.ok(!message.includes('jira-fast-ticket.url'), message);
    assert.ok(!message.includes('JIRA_URL'), message);
    assert.match(
      message,
      /Environment variables of the same names are also read and take precedence\./,
    );
  });
});
