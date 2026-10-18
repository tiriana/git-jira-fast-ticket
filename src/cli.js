import { execFile } from 'node:child_process';

import { formatMissing, missingRequired, resolveConfig } from './config.js';
import { createIssue, JiraError, normalizeBaseUrl } from './jira.js';
import { configStatus, createPrompt, runWizard } from './setup.js';
import { getVersion } from './version.js';

const USAGE_MESSAGE =
  'Usage: git-jira-fast-ticket <PROJECT_KEY> <TITLE> [DESCRIPTION] [--no-checkout | -x]';
const ISSUE_TYPE = 'Task';

export function parseArgs(argv) {
  const result = { help: false, version: false, noCheckout: false, configure: false, positionals: [] };
  let optionsEnded = false;

  for (const arg of argv) {
    if (optionsEnded) {
      result.positionals.push(arg);
      continue;
    }

    switch (arg) {
      case '--':
        optionsEnded = true;
        break;
      case '-h':
      case '--help':
        result.help = true;
        break;
      case '-v':
      case '--version':
        result.version = true;
        break;
      case '-x':
      case '--no-checkout':
        result.noCheckout = true;
        break;
      case '--configure':
        result.configure = true;
        break;
      default:
        result.positionals.push(arg);
    }
  }

  return result;
}

export function sanitizeBranchTitle(title) {
  return title.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function branchName(key, title) {
  return `${key}-${sanitizeBranchTitle(title)}`;
}

export function helpText(config) {
  return [
    'Usage: git-jira-fast-ticket <PROJECT_KEY> <TITLE> [DESCRIPTION] [OPTIONS]',
    '',
    'Options:',
    '  -x, --no-checkout     Skip branch creation and checkout.',
    '  -v, --version         Show version information.',
    '  -h, --help            Show this help message.',
    '  --configure           Set up Jira credentials interactively.',
    '',
    'Environment variables:',
    '  JIRA_URL              The Jira base URL.',
    '  JIRA_EMAIL            Your Jira email.',
    '  JIRA_PAT              Your Jira Personal Access Token.',
    '',
    'Configuration:',
    ...configStatus(config).map((line) => `  ${line}`),
    '',
    'Set a value with: git config --global jira-fast-ticket.<url|email|token> <value>',
    'Run "git-jira-fast-ticket setup" for a guided setup.',
    '',
  ].join('\n');
}

export async function main(argv, deps = {}) {
  const {
    env = process.env,
    cwd = process.cwd(),
    stdin = process.stdin,
    fetchImpl = globalThis.fetch,
    execGit = defaultExecGit,
    runGit,
    ask,
    stdout = write(process.stdout),
    stderr = write(process.stderr),
  } = deps;

  const { help, version, noCheckout, configure, positionals } = parseArgs(argv);
  const config = await resolveConfig({ env, cwd, runGit });

  if (help) {
    stdout(helpText(config));
    return 0;
  }

  if (version) {
    stdout(`git-jira-fast-ticket version ${getVersion()}\n`);
    return 0;
  }

  const prompt = ask ?? createPrompt({ input: stdin, output: process.stdout });
  const existing = { JIRA_URL: config.url, JIRA_EMAIL: config.email, JIRA_PAT: config.pat };

  if (isSetup(configure, positionals)) {
    return runSetup({ existing, prompt, stdout, stderr, cwd, env, runGit });
  }

  if (positionals.length < 2) {
    stderr(`${USAGE_MESSAGE}\n`);
    return 1;
  }

  let resolved = config;
  if (missingRequired(resolved).length > 0 && stdin.isTTY && !env.CI) {
    try {
      await runWizard({ existing, ask: prompt, output: stdout, cwd, env, runGit });
      resolved = await resolveConfig({ env, cwd, runGit });
    } catch (error) {
      stderr(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  }

  const missing = missingRequired(resolved);
  if (missing.length > 0) {
    stderr(`${formatMissing(missing)}\n`);
    return 1;
  }

  const { url: baseUrl, email, pat } = resolved;

  const projectKey = positionals[0];
  const title = positionals[1];
  const description = positionals.length > 2 ? positionals[2] : title;

  let key;
  try {
    ({ key } = await createIssue({
      baseUrl,
      email,
      pat,
      projectKey,
      title,
      description,
      issueType: ISSUE_TYPE,
      fetchImpl,
    }));
  } catch (error) {
    if (!(error instanceof JiraError)) {
      throw error;
    }
    stderr(`Error creating Jira ticket: ${error.message}\n`);
    if (error.body) {
      stderr(`Full response from Jira: ${error.body}\n`);
    }
    return 1;
  }

  const browseUrl = `${normalizeBaseUrl(baseUrl)}/browse/${key}`;
  stdout(`Jira ticket created: ${key} - \u001b[1;34m${browseUrl}\u001b[0m\n`);

  const branch = branchName(key, title);
  if (noCheckout) {
    stdout(
      `Branch creation and checkout skipped. You can manually create the branch: git checkout -b "${branch}"\n`,
    );
    return 0;
  }

  try {
    await execGit(['checkout', '-b', branch]);
  } catch (error) {
    stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  return 0;
}

async function runSetup({ existing, prompt, stdout, stderr, cwd, env, runGit }) {
  try {
    await runWizard({ existing, ask: prompt, output: stdout, cwd, env, runGit });
    stdout('Configuration saved to git config.\n');
    return 0;
  } catch (error) {
    stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

function isSetup(configure, positionals) {
  return configure || (positionals.length === 1 && positionals[0] === 'setup');
}

function defaultExecGit(args) {
  return new Promise((resolve, reject) => {
    execFile('git', args, (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve();
    });
  });
}

function write(stream) {
  return (chunk) => stream.write(chunk);
}
