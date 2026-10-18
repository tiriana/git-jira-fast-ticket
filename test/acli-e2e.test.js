import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const entry = fileURLToPath(new URL('../bin/git-jira-fast-ticket.js', import.meta.url));

const FAKE_ACLI = `#!/bin/sh
if [ -n "$FAKE_ACLI_LOG" ]; then
  printf '%s\\n' "$*" >> "$FAKE_ACLI_LOG"
fi
if [ "$1" = "jira" ] && [ "$2" = "auth" ] && [ "$3" = "status" ]; then
  if [ "$FAKE_ACLI_AUTH" = "no" ]; then
    echo "Error: unauthorized: use 'acli jira auth login' to authenticate" >&2
    exit 1
  fi
  exit 0
fi
if [ "$1" = "jira" ] && [ "$2" = "workitem" ] && [ "$3" = "create" ]; then
  if [ "$FAKE_ACLI_KEY" = "none" ]; then
    echo '{"id":"10001"}'
  else
    echo '{"id":"10001","key":"ABC-123"}'
  fi
  exit 0
fi
exit 0
`;

function run(command, args, { cwd, env, input } = {}) {
  return new Promise((resolve) => {
    const child = execFile(command, args, { cwd, env }, (error, stdout, stderr) => {
      resolve({ code: error ? error.code ?? 1 : 0, stdout, stderr });
    });
    if (input !== undefined) {
      child.stdin.end(input);
    }
  });
}

describe('git-jira-fast-ticket CLI with acli (end to end)', () => {
  let root;
  let home;
  let configHome;
  let acliDir;
  let logPath;
  let stub;
  let jiraUrl;
  let lastRequest;
  let respond;

  function defaultRespond(_req, res) {
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ key: 'ABC-123' }));
  }

  before(async () => {
    root = await mkdtemp(join(tmpdir(), 'gjt-acli-e2e-'));
    home = join(root, 'home');
    configHome = join(root, 'config');
    acliDir = join(root, 'bin');
    await mkdir(home, { recursive: true });
    await mkdir(configHome, { recursive: true });
    await mkdir(acliDir, { recursive: true });

    const acliPath = join(acliDir, 'acli');
    await writeFile(acliPath, FAKE_ACLI);
    await chmod(acliPath, 0o755);

    stub = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        lastRequest = {
          method: req.method,
          url: req.url,
          body: Buffer.concat(chunks).toString('utf8'),
        };
        respond(req, res);
      });
    });
    await new Promise((resolve) => stub.listen(0, '127.0.0.1', resolve));
    jiraUrl = `http://127.0.0.1:${stub.address().port}`;
  });

  beforeEach(async () => {
    lastRequest = undefined;
    respond = defaultRespond;
    logPath = join(root, `acli-${Date.now()}-${Math.random().toString(16).slice(2)}.log`);
  });

  after(async () => {
    stub.closeAllConnections();
    await new Promise((resolve) => stub.close(resolve));
    await rm(root, { recursive: true, force: true });
  });

  function env(overrides = {}) {
    return {
      HOME: home,
      XDG_CONFIG_HOME: configHome,
      GIT_CONFIG_NOSYSTEM: '1',
      PATH: `${acliDir}:${process.env.PATH}`,
      FAKE_ACLI_LOG: logPath,
      ...overrides,
    };
  }

  async function git(args, cwd, overrides = {}) {
    return run('git', args, { cwd, env: env(overrides) });
  }

  async function makeRepo() {
    const repo = await mkdtemp(join(root, 'repo-'));
    await git(['init', '-q'], repo);
    await git(['config', 'user.email', 'test@example.com'], repo);
    await git(['config', 'user.name', 'Test User'], repo);
    await writeFile(join(repo, 'README.md'), '# test\n');
    await git(['add', 'README.md'], repo);
    await git(['commit', '-q', '-m', 'init'], repo);
    return repo;
  }

  async function acliLog() {
    try {
      return await readFile(logPath, 'utf8');
    } catch {
      return '';
    }
  }

  it('uses acli automatically, creates the issue and the branch without asking for credentials', async () => {
    const repo = await makeRepo();

    const result = await run('node', [entry, 'ABC', 'Add acli ticket'], { cwd: repo, env: env() });

    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /Jira ticket created: ABC-123/);
    assert.ok(!result.stdout.includes('browse'), result.stdout);
    assert.ok(!result.stdout.includes('Jira configuration'), result.stdout);
    assert.ok(!result.stderr.includes('JIRA_URL'), result.stderr);

    const current = (await git(['rev-parse', '--abbrev-ref', 'HEAD'], repo)).stdout.trim();
    assert.equal(current, 'ABC-123-Add-acli-ticket');

    const log = await acliLog();
    assert.match(log, /jira workitem create/);
    assert.match(log, /--summary Add acli ticket/);
    assert.match(log, /--project ABC/);
  });

  it('keeps the REST path when a PAT is configured even though acli is usable', async () => {
    const repo = await makeRepo();

    const result = await run('node', [entry, 'ABC', 'REST branch'], {
      cwd: repo,
      env: env({ JIRA_URL: jiraUrl, JIRA_EMAIL: 'dev@example.com', JIRA_PAT: 'secret' }),
    });

    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /Jira ticket created: ABC-123/);
    assert.ok(result.stdout.includes(`${jiraUrl}/browse/ABC-123`), result.stdout);
    assert.ok(lastRequest, 'the REST endpoint received the request');
    assert.ok(!(await acliLog()).includes('workitem create'), 'acli was not used');
    assert.ok(!result.stdout.includes('secret'), result.stdout);
    assert.ok(!result.stderr.includes('secret'), result.stderr);
  });

  it('fails with the login hint when acli is forced and unauthenticated, creating no branch', async () => {
    const repo = await makeRepo();

    const result = await run('node', [entry, 'ABC', 'No auth'], {
      cwd: repo,
      env: env({ JIRA_BACKEND: 'acli', FAKE_ACLI_AUTH: 'no' }),
    });

    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /acli jira auth login/);
    assert.ok(!result.stdout.includes('Jira ticket created'), result.stdout);

    const branches = await git(['branch', '--list', 'ABC-123-No-auth'], repo);
    assert.equal(branches.stdout.trim(), '');
  });

  it('fails without printing a branch name when acli returns no key', async () => {
    const repo = await makeRepo();

    const result = await run('node', [entry, 'ABC', 'Missing key'], {
      cwd: repo,
      env: env({ FAKE_ACLI_KEY: 'none' }),
    });

    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /work item key/);
    assert.ok(!result.stdout.includes('Jira ticket created'), result.stdout);
    assert.ok(!result.stdout.includes('git checkout -b'), result.stdout);

    const branches = await git(['branch', '--list', 'ABC-123-Missing-key'], repo);
    assert.equal(branches.stdout.trim(), '');
  });

  it('omits --description when the description is empty', async () => {
    const repo = await makeRepo();

    const result = await run('node', [entry, 'ABC', 'Empty body', ''], {
      cwd: repo,
      env: env(),
    });

    assert.equal(result.code, 0, result.stderr);
    const log = await acliLog();
    const createLine = log.split('\n').find((line) => line.includes('workitem create'));
    assert.ok(createLine, log);
    assert.ok(!createLine.includes('--description'), createLine);
  });

  it('never prints the PAT even when acli is forced', async () => {
    const repo = await makeRepo();

    const result = await run('node', [entry, 'ABC', 'Forced acli'], {
      cwd: repo,
      env: env({ JIRA_BACKEND: 'acli', JIRA_PAT: 'top-secret-pat' }),
    });

    assert.equal(result.code, 0, result.stderr);
    assert.ok(!result.stdout.includes('top-secret-pat'), result.stdout);
    assert.ok(!result.stderr.includes('top-secret-pat'), result.stderr);
    assert.ok(!(await acliLog()).includes('top-secret-pat'), await acliLog());
  });

  it('setup reports the acli backend, writes nothing and does not prompt', async () => {
    const repo = await makeRepo();
    const setupHome = await mkdtemp(join(root, 'setup-home-'));
    const setupEnv = env({
      HOME: setupHome,
      XDG_CONFIG_HOME: join(setupHome, '.config'),
    });

    const result = await run('node', [entry, 'setup'], { cwd: repo, env: setupEnv, input: '' });

    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /acli/);
    assert.match(result.stdout, /JIRA_BACKEND=api/);
    assert.ok(!result.stdout.includes('Configuration saved'), result.stdout);

    const stored = await run('git', ['config', '--global', '--get', 'jira-fast-ticket.url'], {
      cwd: repo,
      env: setupEnv,
    });
    assert.notEqual(stored.code, 0, stored.stdout);
  });
});
