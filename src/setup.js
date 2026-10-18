import readline from 'node:readline/promises';

import { CONFIG_SECTION, configKey, defaultRunGit } from './config.js';

const URL_PATTERN = /^https?:\/\//;
const SOURCE_LABELS = {
  env: 'environment',
  local: 'git config, this repository',
  global: 'git config, all repositories',
  default: 'built-in default',
};

export function configStatus(config) {
  return Object.keys(config.sources).map((key) => {
    const source = config.sources[key];
    return source ? `${key} set (${SOURCE_LABELS[source]})` : `${key} not set`;
  });
}

export function createPrompt({ input, output }) {
  const bufferedLines = [];
  const waiters = [];
  let reader;

  // A fresh interface per question drops any lines readline already buffered from a
  // pipe, so non-interactive input is served from a single shared interface instead.
  const nextQueuedLine = () => {
    if (!reader) {
      reader = readline.createInterface({ input, output });
      reader.on('line', (line) => {
        const waiter = waiters.shift();
        if (waiter) {
          waiter(line);
        } else {
          bufferedLines.push(line);
        }
      });
    }

    if (bufferedLines.length > 0) {
      return Promise.resolve(bufferedLines.shift());
    }
    return new Promise((resolve) => waiters.push(resolve));
  };

  return async function ask(question, { secret = false } = {}) {
    if (secret) {
      return askSecret(question, { input, output, nextQueuedLine });
    }

    if (input.isTTY) {
      const rl = readline.createInterface({ input, output });
      try {
        return (await rl.question(question)).trim();
      } finally {
        rl.close();
      }
    }

    output.write(question);
    return (await nextQueuedLine()).trim();
  };
}

export async function runWizard({
  existing = {},
  ask,
  output,
  cwd = process.cwd(),
  env = process.env,
  runGit = defaultRunGit,
  backend,
}) {
  const prompt = ask ?? createPrompt({ input: process.stdin, output: process.stdout });
  const emit = output ?? ((text) => process.stdout.write(text));

  if (backend === 'acli') {
    emit('Atlassian CLI (acli) is installed and authenticated.\n');
    emit('No Jira token is needed; work items are created with acli.\n');
    emit('Set JIRA_BACKEND=api to force the REST API instead.\n');
    return { backend };
  }

  emit('Jira configuration\n');
  emit(
    `These values are stored in git config (section ${CONFIG_SECTION}) and apply to every repository unless stated otherwise.\n`,
  );
  emit('Environment variables of the same names take precedence.\n');

  const url = await promptUrl(prompt, emit, existing.JIRA_URL);
  const email = await promptValue(prompt, {
    key: 'JIRA_EMAIL',
    label: 'Jira email',
    existing: existing.JIRA_EMAIL,
  });
  const token = await promptSecret(prompt, existing.JIRA_PAT);
  const scope = await promptTokenScope({ prompt, emit, cwd, env, runGit });

  await writeConfigValue(runGit, { scope: '--global', key: configKey('url'), value: url, cwd, env });
  await writeConfigValue(runGit, {
    scope: '--global',
    key: configKey('email'),
    value: email,
    cwd,
    env,
  });
  await writeConfigValue(runGit, { scope, key: configKey('token'), value: token, cwd, env });

  return { url, email, token, scope };
}

function askSecret(question, { input, output, nextQueuedLine }) {
  output.write(question);

  if (!input.isTTY) {
    return nextQueuedLine().then((line) => line.trim());
  }

  return new Promise((resolve) => {
    input.setRawMode(true);
    let value = '';

    const onData = (chunk) => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\u0003') {
          input.removeListener('data', onData);
          input.setRawMode(false);
          process.exit(130);
        }

        if (char === '\n' || char === '\r') {
          input.removeListener('data', onData);
          input.setRawMode(false);
          output.write('\n');
          resolve(value.trim());
          return;
        }

        value = char === '\u007f' || char === '\b' ? value.slice(0, -1) : value + char;
      }
    };

    input.on('data', onData);
  });
}

async function promptUrl(ask, output, existing) {
  const reason = 'The Jira URL must start with http:// or https://.';

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const answer = await ask(`Jira URL${describeExisting(existing)}: `);
    const value = answer === '' ? existing : answer;
    if (value && URL_PATTERN.test(value)) {
      assertNoNewline('JIRA_URL', value);
      return value;
    }

    if (attempt === 1) {
      throw new Error(reason);
    }
    output(`${reason}\n`);
  }
}

async function promptValue(ask, { key, label, existing }) {
  const answer = await ask(`${label}${describeExisting(existing)}: `);
  const value = answer === '' ? existing : answer;
  if (!value) {
    throw new Error(`A value is required for ${key}.`);
  }
  assertNoNewline(key, value);
  return value;
}

async function promptSecret(ask, existing) {
  const note = existing ? ' (a value is already stored)' : '';
  const answer = await ask(`Jira Personal Access Token${note}: `, { secret: true });
  const value = answer === '' ? existing : answer;
  if (!value) {
    throw new Error('A value is required for JIRA_PAT.');
  }
  assertNoNewline('JIRA_PAT', value);
  return value;
}

async function promptTokenScope({ prompt, emit, cwd, env, runGit }) {
  if (!(await isInsideRepository(runGit, cwd, env))) {
    emit('Not inside a git repository; storing the token in the shared git config.\n');
    return '--global';
  }

  emit('Where should the token be stored?\n');
  emit('  this repository   written to .git/config, which cannot be committed\n');
  emit('  all repositories  written to the shared git config\n');
  const answer = await prompt(
    'Store the token in this repository (default) or all repositories (answer "all")? ',
  );
  return answer === 'all' || answer === 'a' ? '--global' : '--local';
}

async function isInsideRepository(runGit, cwd, env) {
  try {
    const result = await runGit(['rev-parse', '--is-inside-work-tree'], { cwd, env });
    return Boolean(result && result.ok && result.stdout.trim() === 'true');
  } catch {
    return false;
  }
}

async function writeConfigValue(runGit, { scope, key, value, cwd, env }) {
  let result;
  try {
    result = await runGit(['config', scope, key, value], { cwd, env });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to write ${key} to git config: ${message}`);
  }

  if (!result || result.ok === false) {
    const message = result && result.stderr ? result.stderr.trim() : 'git config failed';
    throw new Error(`Failed to write ${key} to git config: ${message}`);
  }
}

function describeExisting(existing) {
  return existing ? ` [${existing}]` : '';
}

function assertNoNewline(name, value) {
  if (/[\r\n]/.test(value)) {
    throw new Error(`A value for ${name} cannot contain a newline.`);
  }
}
