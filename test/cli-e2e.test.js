import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import http from 'node:http';

const entry = fileURLToPath(new URL('../bin/git-jira-fast-ticket.js', import.meta.url));
const pkg = createRequire(import.meta.url)('../package.json');

function run(command, args, { cwd, env }) {
  return new Promise((resolve) => {
    execFile(command, args, { cwd, env }, (error, stdout, stderr) => {
      resolve({ code: error ? error.code ?? 1 : 0, stdout, stderr });
    });
  });
}

describe('git-jira-fast-ticket CLI (end to end)', () => {
  let root;
  let home;
  let configHome;
  let stub;
  let jiraUrl;

  before(async () => {
    root = await mkdtemp(join(tmpdir(), 'gjt-e2e-'));
    home = join(root, 'home');
    configHome = join(root, 'config');
    await mkdir(home, { recursive: true });
    await mkdir(configHome, { recursive: true });

    stub = http.createServer((req, res) => {
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ key: 'ABC-123' }));
    });
    await new Promise((resolve) => stub.listen(0, '127.0.0.1', resolve));
    jiraUrl = `http://127.0.0.1:${stub.address().port}`;
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
      PATH: process.env.PATH,
      JIRA_URL: jiraUrl,
      JIRA_EMAIL: 'dev@example.com',
      JIRA_PAT: 'secret',
      ...overrides,
    };
  }

  async function git(args, cwd) {
    return run('git', args, { cwd, env: env() });
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

  it('creates the issue and checks out a branch named after the ticket', async () => {
    const repo = await makeRepo();
    const initialBranch = (await git(['rev-parse', '--abbrev-ref', 'HEAD'], repo)).stdout.trim();

    const result = await run('node', [entry, 'ABC', 'Add login page'], { cwd: repo, env: env() });

    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /Jira ticket created: ABC-123/);

    const current = (await git(['rev-parse', '--abbrev-ref', 'HEAD'], repo)).stdout.trim();
    assert.equal(current, 'ABC-123-Add-login-page');
    assert.notEqual(current, initialBranch);
  });

  it('does not create a branch with --no-checkout', async () => {
    const repo = await makeRepo();
    const initialBranch = (await git(['rev-parse', '--abbrev-ref', 'HEAD'], repo)).stdout.trim();

    const result = await run('node', [entry, '-x', 'ABC', 'Skip the branch'], { cwd: repo, env: env() });

    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /skipped/);

    const current = (await git(['rev-parse', '--abbrev-ref', 'HEAD'], repo)).stdout.trim();
    assert.equal(current, initialBranch);

    const branches = await git(['branch', '--list', 'ABC-123-Skip-the-branch'], repo);
    assert.equal(branches.stdout.trim(), '');
  });

  it('prints the package version from an unrelated working directory', async () => {
    const unrelated = await mkdtemp(join(root, 'unrelated-'));

    const result = await run('node', [entry, '--version'], { cwd: unrelated, env: env() });

    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout.trim(), `git-jira-fast-ticket version ${pkg.version}`);
  });

  it('prints the usage line and exits zero for --help', async () => {
    const repo = await makeRepo();

    const result = await run('node', [entry, '--help'], { cwd: repo, env: env() });

    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /Usage: git-jira <PROJECT_KEY> <TITLE> \[DESCRIPTION\] \[OPTIONS\]/);
  });

  it('fails when the Jira environment variables are missing', async () => {
    const repo = await makeRepo();
    const incomplete = env();
    delete incomplete.JIRA_URL;
    delete incomplete.JIRA_EMAIL;
    delete incomplete.JIRA_PAT;

    const result = await run('node', [entry, 'ABC', 'A title'], { cwd: repo, env: incomplete });

    assert.notEqual(result.code, 0);
    assert.match(
      result.stderr,
      /Please set the JIRA_URL, JIRA_EMAIL, and JIRA_PAT environment variables\./,
    );
  });

  it('normalizes a trailing slash in the Jira base URL', async () => {
    const repo = await makeRepo();

    const result = await run('node', [entry, 'ABC', 'Trailing slash'], {
      cwd: repo,
      env: env({ JIRA_URL: `${jiraUrl}/` }),
    });

    assert.equal(result.code, 0, result.stderr);
    assert.ok(result.stdout.includes(`${jiraUrl}/browse/ABC-123`), result.stdout);
    assert.ok(!result.stdout.includes(`${jiraUrl}//browse`), result.stdout);
  });
});
