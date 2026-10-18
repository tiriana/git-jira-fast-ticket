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
      GIT_CONFIG_NOSYSTEM: '1',
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
    assert.match(
      result.stdout,
      /Usage: git-jira-fast-ticket <PROJECT_KEY> <TITLE> \[DESCRIPTION\] \[OPTIONS\]/,
    );
  });

  it('fails when required configuration is missing everywhere', async () => {
    const repo = await makeRepo();
    const incomplete = env();
    delete incomplete.JIRA_URL;
    delete incomplete.JIRA_EMAIL;
    delete incomplete.JIRA_PAT;

    const result = await run('node', [entry, 'ABC', 'A title'], { cwd: repo, env: incomplete });

    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /Missing required configuration:/);
    assert.match(result.stderr, /JIRA_URL/);
    assert.match(result.stderr, /JIRA_EMAIL/);
    assert.match(result.stderr, /JIRA_PAT/);
    assert.match(result.stderr, /git config --global jira-fast-ticket\.url <value>/);
    assert.match(result.stderr, /git config --global jira-fast-ticket\.email <value>/);
    assert.match(result.stderr, /git config --global jira-fast-ticket\.token <value>/);
  });

  it('does not start the wizard when stdin is not a TTY', async () => {
    const repo = await makeRepo();
    const incomplete = env();
    delete incomplete.JIRA_URL;
    delete incomplete.JIRA_EMAIL;
    delete incomplete.JIRA_PAT;

    const result = await run('node', [entry, 'ABC', 'A title'], { cwd: repo, env: incomplete });

    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /Missing required configuration:/);
    assert.ok(!result.stdout.includes('Jira configuration'), result.stdout);
  });

  it('saves configuration through the setup command and later uses it', async () => {
    const repo = await makeRepo();
    const setupHome = await mkdtemp(join(root, 'setup-home-'));
    const setupEnv = {
      HOME: setupHome,
      GIT_CONFIG_NOSYSTEM: '1',
      PATH: process.env.PATH,
    };

    const setup = await run('node', [entry, 'setup'], {
      cwd: repo,
      env: setupEnv,
      input: `${jiraUrl}\ndev@example.com\nsecret-pat\n\n`,
    });

    assert.equal(setup.code, 0, setup.stderr);
    assert.ok(!setup.stdout.includes('secret-pat'), setup.stdout);

    const globalUrl = await run('git', ['config', '--global', '--get', 'jira-fast-ticket.url'], {
      cwd: repo,
      env: setupEnv,
    });
    assert.equal(globalUrl.stdout.trim(), jiraUrl);

    const globalEmail = await run('git', ['config', '--global', '--get', 'jira-fast-ticket.email'], {
      cwd: repo,
      env: setupEnv,
    });
    assert.equal(globalEmail.stdout.trim(), 'dev@example.com');

    const localToken = await run('git', ['config', '--local', '--get', 'jira-fast-ticket.token'], {
      cwd: repo,
      env: setupEnv,
    });
    assert.equal(localToken.stdout.trim(), 'secret-pat');

    const create = await run('node', [entry, 'ABC', 'Setup branch'], { cwd: repo, env: setupEnv });

    assert.equal(create.code, 0, create.stderr);
    assert.match(create.stdout, /Jira ticket created: ABC-123/);

    const current = (await git(['rev-parse', '--abbrev-ref', 'HEAD'], repo)).stdout.trim();
    assert.equal(current, 'ABC-123-Setup-branch');
  });

  it('reads Jira credentials from the repository git config', async () => {
    const repo = await makeRepo();
    await git(['config', '--local', 'jira-fast-ticket.url', jiraUrl], repo);
    await git(['config', '--local', 'jira-fast-ticket.email', 'dev@example.com'], repo);
    await git(['config', '--local', 'jira-fast-ticket.token', 'secret'], repo);

    const configuredEnv = env();
    delete configuredEnv.JIRA_URL;
    delete configuredEnv.JIRA_EMAIL;
    delete configuredEnv.JIRA_PAT;

    const result = await run('node', [entry, 'ABC', 'Config branch'], {
      cwd: repo,
      env: configuredEnv,
    });

    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /Jira ticket created: ABC-123/);

    const current = (await git(['rev-parse', '--abbrev-ref', 'HEAD'], repo)).stdout.trim();
    assert.equal(current, 'ABC-123-Config-branch');
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
