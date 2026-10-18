import { accessSync, constants } from 'node:fs';
import { execFile, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

const entry = fileURLToPath(new URL('../bin/git-jira-fast-ticket.js', import.meta.url));

function onPath(name) {
  return (process.env.PATH ?? '')
    .split(':')
    .some((dir) => {
      try {
        accessSync(join(dir, name), constants.X_OK);
        return true;
      } catch {
        return false;
      }
    });
}

// The wizard only starts when stdin is a terminal, so these tests need a real
// pty to reach the path a user actually walks. script(1) supplies one on Linux
// and macOS; without it the tests are skipped rather than quietly falling back
// to the piped path, which is a different branch of the code.
const ptySkip = onPath('script') ? false : 'script(1) is required to allocate a pty';

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function spawnInPty(argv, options) {
  if (process.platform === 'darwin') {
    return spawn('script', ['-q', '/dev/null', ...argv], options);
  }
  return spawn('script', ['-qec', argv.map(shellQuote).join(' '), '/dev/null'], options);
}

// Answers are written only once the matching prompt has appeared, the way a
// person types, so the test exercises the terminal's own echo behaviour.
function drive({ argv, cwd, env, answers, timeout = 20000 }) {
  return new Promise((resolve, reject) => {
    const child = spawnInPty(argv, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let transcript = '';
    let stderr = '';
    let unmatched = '';
    let answered = 0;

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(
        new Error(
          `timed out waiting for "${answers[answered]?.prompt}" after ${answered}/${answers.length} prompts` +
            `\n--- output ---\n${transcript}\n--- stderr ---\n${stderr}`,
        ),
      );
    }, timeout);

    function pump(text) {
      transcript += text;
      unmatched += text;
      while (answered < answers.length && unmatched.includes(answers[answered].prompt)) {
        const at = unmatched.indexOf(answers[answered].prompt);
        unmatched = unmatched.slice(at + answers[answered].prompt.length);
        child.stdin.write(answers[answered].answer);
        answered += 1;
      }
    }

    child.stdout.on('data', (chunk) => pump(chunk.toString()));
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, transcript, stderr, answered });
    });
  });
}

function assertInOrder(text, labels) {
  let at = -1;
  for (const label of labels) {
    const found = text.indexOf(label, at + 1);
    assert.ok(found > at, `expected "${label}" after position ${at} in:\n${text}`);
    at = found;
  }
}

function git(args, cwd, env) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, env }, (error, stdout, stderr) => {
      resolve({ code: error ? error.code ?? 1 : 0, stdout: stdout.trim(), stderr });
    });
  });
}

// Every test hands the child a complete environment: the only value inherited
// from this process is PATH, which git, node and script are found through. No
// JIRA_* value, no CI, no HOME from the developer's session.
function isolatedEnv(home) {
  return {
    HOME: home,
    XDG_CONFIG_HOME: join(home, '.config'),
    GIT_CONFIG_NOSYSTEM: '1',
    PATH: process.env.PATH,
  };
}

function userConfigSnapshot() {
  const base = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
  return Promise.all(
    [join(homedir(), '.gitconfig'), join(base, 'git', 'config')].map(async (path) => {
      try {
        return [path, await readFile(path, 'utf8')];
      } catch {
        return [path, null];
      }
    }),
  );
}

describe('first run on a terminal (end to end)', () => {
  let root;
  let stub;
  let jiraUrl;
  let lastRequest;
  let respond;
  let userConfigBefore;

  before(async () => {
    root = await mkdtemp(join(tmpdir(), 'gjt-wizard-'));
    userConfigBefore = await userConfigSnapshot();

    stub = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        lastRequest = {
          method: req.method,
          url: req.url,
          authorization: req.headers.authorization,
          body: Buffer.concat(chunks).toString('utf8'),
        };
        respond(req, res);
      });
    });
    await new Promise((resolve) => stub.listen(0, '127.0.0.1', resolve));
    jiraUrl = `http://127.0.0.1:${stub.address().port}`;
  });

  beforeEach(() => {
    lastRequest = undefined;
    respond = (_req, res) => {
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ key: 'DEMO-7' }));
    };
  });

  after(async () => {
    assert.deepEqual(
      await userConfigSnapshot(),
      userConfigBefore,
      "the suite must not modify the developer's own git config",
    );
    stub.closeAllConnections();
    await new Promise((resolve) => stub.close(resolve));
    await rm(root, { recursive: true, force: true });
  });

  async function freshHome() {
    const home = await mkdtemp(join(root, 'home-'));
    await mkdir(join(home, '.config'), { recursive: true });
    return home;
  }

  async function makeRepo(home) {
    const repo = await mkdtemp(join(root, 'repo-'));
    const env = isolatedEnv(home);
    await git(['init', '-q'], repo, env);
    await git(['config', 'user.email', 'test@example.com'], repo, env);
    await git(['config', 'user.name', 'Test User'], repo, env);
    await writeFile(join(repo, 'README.md'), '# test\n');
    await git(['add', 'README.md'], repo, env);
    await git(['commit', '-q', '-m', 'init'], repo, env);
    return repo;
  }

  it('walks prompts, ticket and branch from an unconfigured machine', { skip: ptySkip }, async () => {
    const home = await freshHome();
    const env = isolatedEnv(home);
    const repo = await makeRepo(home);

    const run = await drive({
      argv: [process.execPath, entry, 'DEMO', 'Add the login page'],
      cwd: repo,
      env,
      answers: [
        { prompt: 'Jira URL:', answer: 'ftp://not-a-url\n' },
        { prompt: 'Jira URL:', answer: `${jiraUrl}\n` },
        { prompt: 'Jira email:', answer: 'dev@example.com\n' },
        { prompt: 'Jira Personal Access Token:', answer: 's3cret-token\n' },
        { prompt: 'Store the token', answer: '\n' },
      ],
    });

    assert.equal(run.answered, 5, run.transcript);
    if (process.platform !== 'darwin') {
      assert.equal(run.code, 0, run.stderr);
    }

    assert.match(run.transcript, /Jira configuration/);
    assert.match(run.transcript, /must start with http:\/\/ or https:\/\//);
    assertInOrder(run.transcript, [
      'Jira URL:',
      'Jira email:',
      'Jira Personal Access Token:',
      'Store the token',
    ]);

    assert.ok(!run.transcript.includes('s3cret-token'), run.transcript);

    assert.match(run.transcript, /Jira ticket created: DEMO-7/);
    assert.equal(lastRequest.method, 'POST');
    assert.equal(lastRequest.url, '/rest/api/3/issue');
    assert.equal(
      lastRequest.authorization,
      `Basic ${Buffer.from('dev@example.com:s3cret-token').toString('base64')}`,
    );
    const payload = JSON.parse(lastRequest.body);
    assert.deepEqual(payload.fields.project, { key: 'DEMO' });
    assert.equal(payload.fields.summary, 'Add the login page');
    assert.equal(payload.fields.issuetype.name, 'Task');

    assert.equal(
      (await git(['rev-parse', '--abbrev-ref', 'HEAD'], repo, env)).stdout,
      'DEMO-7-Add-the-login-page',
    );

    assert.equal(
      (await git(['config', '--global', '--get', 'jira-fast-ticket.url'], repo, env)).stdout,
      jiraUrl,
    );
    assert.equal(
      (await git(['config', '--global', '--get', 'jira-fast-ticket.email'], repo, env)).stdout,
      'dev@example.com',
    );
    assert.equal(
      (await git(['config', '--local', '--get', 'jira-fast-ticket.token'], repo, env)).stdout,
      's3cret-token',
    );
    assert.equal(
      (await git(['config', '--global', '--get', 'jira-fast-ticket.token'], repo, env)).stdout,
      '',
    );

    // Nothing was offered as an existing value, so no configuration outside the
    // isolated HOME was read.
    assert.ok(!run.transcript.includes('Jira URL ['), run.transcript);
    assert.ok(!run.transcript.includes('Jira email ['), run.transcript);
  });

  it('reuses stored values on enter and stores the token globally on "all"', { skip: ptySkip }, async () => {
    const home = await freshHome();
    const env = isolatedEnv(home);
    const repo = await makeRepo(home);

    const first = await drive({
      argv: [process.execPath, entry, '--configure'],
      cwd: repo,
      env,
      answers: [
        { prompt: 'Jira URL:', answer: `${jiraUrl}\n` },
        { prompt: 'Jira email:', answer: 'dev@example.com\n' },
        { prompt: 'Jira Personal Access Token:', answer: 'a-pat\n' },
        { prompt: 'Store the token', answer: '\n' },
      ],
    });
    assert.equal(first.answered, 4, first.transcript);
    assert.ok(!first.transcript.includes('a-pat'), first.transcript);

    const second = await drive({
      argv: [process.execPath, entry, '--configure'],
      cwd: repo,
      env,
      answers: [
        { prompt: `Jira URL [${jiraUrl}]`, answer: '\n' },
        { prompt: 'Jira email [dev@example.com]', answer: '\n' },
        { prompt: 'Jira Personal Access Token (a value is already stored)', answer: '\n' },
        { prompt: 'Store the token', answer: 'all\n' },
      ],
    });
    assert.equal(second.answered, 4, second.transcript);
    assert.ok(!second.transcript.includes('a-pat'), second.transcript);

    assert.equal(
      (await git(['config', '--global', '--get', 'jira-fast-ticket.url'], repo, env)).stdout,
      jiraUrl,
    );
    assert.equal(
      (await git(['config', '--global', '--get', 'jira-fast-ticket.token'], repo, env)).stdout,
      'a-pat',
    );
  });
});
