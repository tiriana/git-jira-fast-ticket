import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { configStatus, createPrompt, runWizard } from '../src/setup.js';

function git(args, { cwd, env }) {
  return new Promise((resolveResult) => {
    execFile('git', args, { cwd, env }, (error, stdout, stderr) => {
      resolveResult({ code: error ? error.code ?? 1 : 0, stdout, stderr });
    });
  });
}

async function withRepo(run) {
  const root = await mkdtemp(join(tmpdir(), 'gjt-setup-'));
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

function readConfig({ scope, key, cwd, env }) {
  return git(['config', scope, '--get', key], { cwd, env }).then((result) =>
    result.code === 0 ? result.stdout.trim() : undefined,
  );
}

function queueAsk(answers) {
  const calls = [];
  const ask = async (question, options) => {
    calls.push({ question, options });
    return answers.shift();
  };
  ask.calls = calls;
  return ask;
}

function collector() {
  const chunks = [];
  const write = (text) => chunks.push(text);
  write.text = () => chunks.join('');
  return write;
}

describe('runWizard', () => {
  it('writes the URL and email to the global scope and the token to the repository by default', async () => {
    await withRepo(async ({ repo, env }) => {
      const ask = queueAsk(['https://example.atlassian.net', 'dev@example.com', 'a-pat']);

      await runWizard({ ask, output: collector(), cwd: repo, env });

      assert.equal(
        await readConfig({ scope: '--global', key: 'jira-fast-ticket.url', cwd: repo, env }),
        'https://example.atlassian.net',
      );
      assert.equal(
        await readConfig({ scope: '--global', key: 'jira-fast-ticket.email', cwd: repo, env }),
        'dev@example.com',
      );
      assert.equal(
        await readConfig({ scope: '--local', key: 'jira-fast-ticket.token', cwd: repo, env }),
        'a-pat',
      );
      assert.equal(
        await readConfig({ scope: '--global', key: 'jira-fast-ticket.token', cwd: repo, env }),
        undefined,
      );
    });
  });

  it('writes the token to the global scope when the answer is "all"', async () => {
    await withRepo(async ({ repo, env }) => {
      const ask = queueAsk(['https://example.atlassian.net', 'dev@example.com', 'a-pat', 'all']);

      await runWizard({ ask, output: collector(), cwd: repo, env });

      assert.equal(
        await readConfig({ scope: '--global', key: 'jira-fast-ticket.token', cwd: repo, env }),
        'a-pat',
      );
      assert.equal(
        await readConfig({ scope: '--local', key: 'jira-fast-ticket.token', cwd: repo, env }),
        undefined,
      );
    });
  });

  it('accepts "a" as the global scope', async () => {
    await withRepo(async ({ repo, env }) => {
      const ask = queueAsk(['https://example.atlassian.net', 'dev@example.com', 'a-pat', 'a']);

      await runWizard({ ask, output: collector(), cwd: repo, env });

      assert.equal(
        await readConfig({ scope: '--global', key: 'jira-fast-ticket.token', cwd: repo, env }),
        'a-pat',
      );
    });
  });

  it('keeps existing values when every answer is empty', async () => {
    await withRepo(async ({ repo, env }) => {
      const existing = {
        JIRA_URL: 'https://old.atlassian.net',
        JIRA_EMAIL: 'old@example.com',
        JIRA_PAT: 'old-pat',
      };
      const ask = queueAsk(['', '', '', '']);

      await runWizard({ ask, output: collector(), existing, cwd: repo, env });

      assert.equal(
        await readConfig({ scope: '--global', key: 'jira-fast-ticket.url', cwd: repo, env }),
        'https://old.atlassian.net',
      );
      assert.equal(
        await readConfig({ scope: '--local', key: 'jira-fast-ticket.token', cwd: repo, env }),
        'old-pat',
      );
    });
  });

  it('re-prompts once after an invalid URL and accepts a valid second answer', async () => {
    await withRepo(async ({ repo, env }) => {
      const ask = queueAsk(['not-a-url', 'https://ok.example', 'dev@example.com', 'a-pat']);

      await runWizard({ ask, output: collector(), cwd: repo, env });

      assert.equal(
        await readConfig({ scope: '--global', key: 'jira-fast-ticket.url', cwd: repo, env }),
        'https://ok.example',
      );
    });
  });

  it('rejects the URL after a second invalid answer', async () => {
    await withRepo(async ({ repo, env }) => {
      const ask = queueAsk(['not-a-url', 'still-not-a-url']);

      await assert.rejects(
        () => runWizard({ ask, output: collector(), cwd: repo, env }),
        /https?:\/\//,
      );
    });
  });

  it('throws naming the key when a required answer is missing', async () => {
    await withRepo(async ({ repo, env }) => {
      const ask = queueAsk(['https://example.atlassian.net', '', '']);

      await assert.rejects(
        () => runWizard({ ask, output: collector(), cwd: repo, env }),
        /JIRA_EMAIL/,
      );
    });
  });

  it('rejects a value containing a newline', async () => {
    await withRepo(async ({ repo, env }) => {
      const ask = queueAsk(['https://example.atlassian.net', 'dev@example.com\ninjected', 'a-pat']);

      await assert.rejects(
        () => runWizard({ ask, output: collector(), cwd: repo, env }),
        /newline/,
      );
    });
  });

  it('never prints the token value', async () => {
    await withRepo(async ({ repo, env }) => {
      const printf = collector();
      const ask = queueAsk(['https://example.atlassian.net', 'dev@example.com', 'super-secret']);

      await runWizard({ ask, output: printf, existing: { JIRA_PAT: 'old-secret' }, cwd: repo, env });

      assert.ok(!printf.text().includes('super-secret'), printf.text());
      assert.ok(!printf.text().includes('old-secret'), printf.text());
    });
  });

  it('consumes queued piped lines in order', async () => {
    await withRepo(async ({ repo, env }) => {
      const input = new PassThrough();
      input.isTTY = false;
      const output = new PassThrough();
      const printf = collector();
      output.on('data', (chunk) => printf(chunk.toString()));

      const ask = createPrompt({ input, output });
      input.write('https://example.atlassian.net\ndev@example.com\na-pat\n\n');

      await runWizard({ ask, output: printf, cwd: repo, env });

      assert.equal(
        await readConfig({ scope: '--global', key: 'jira-fast-ticket.url', cwd: repo, env }),
        'https://example.atlassian.net',
      );
      assert.equal(
        await readConfig({ scope: '--global', key: 'jira-fast-ticket.email', cwd: repo, env }),
        'dev@example.com',
      );
      assert.equal(
        await readConfig({ scope: '--local', key: 'jira-fast-ticket.token', cwd: repo, env }),
        'a-pat',
      );
    });
  });

  it('writes the token globally without a scope prompt outside a repository', async () => {
    await withRepo(async ({ outside, env }) => {
      const ask = queueAsk(['https://example.atlassian.net', 'dev@example.com', 'a-pat']);

      await runWizard({ ask, output: collector(), cwd: outside, env });

      assert.equal(
        await readConfig({ scope: '--global', key: 'jira-fast-ticket.token', cwd: outside, env }),
        'a-pat',
      );
      assert.equal(ask.calls.length, 3);
    });
  });
});

describe('configStatus', () => {
  it('labels environment, repository, global and unset sources', () => {
    assert.deepEqual(configStatus({ sources: { JIRA_URL: 'env' } }), [
      'JIRA_URL set (environment)',
    ]);
    assert.deepEqual(configStatus({ sources: { JIRA_EMAIL: 'local' } }), [
      'JIRA_EMAIL set (git config, this repository)',
    ]);
    assert.deepEqual(configStatus({ sources: { JIRA_PAT: 'global' } }), [
      'JIRA_PAT set (git config, all repositories)',
    ]);
    assert.deepEqual(configStatus({ sources: { JIRA_URL: undefined } }), ['JIRA_URL not set']);
  });

  it('emits one line per source key and never the token value', () => {
    const status = configStatus({
      sources: { JIRA_URL: 'env', JIRA_EMAIL: 'local', JIRA_PAT: 'global' },
      pat: 'do-not-print-me',
    });

    assert.deepEqual(status, [
      'JIRA_URL set (environment)',
      'JIRA_EMAIL set (git config, this repository)',
      'JIRA_PAT set (git config, all repositories)',
    ]);
    assert.ok(!status.join('\n').includes('do-not-print-me'));
  });
});
