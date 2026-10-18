import { execFile } from 'node:child_process';

import { createIssue, JiraError, normalizeBaseUrl } from './jira.js';
import { getVersion } from './version.js';

const MISSING_ENV_MESSAGE =
  'Please set the JIRA_URL, JIRA_EMAIL, and JIRA_PAT environment variables.';
const USAGE_MESSAGE =
  'Usage: git-jira <PROJECT_KEY> <TITLE> [DESCRIPTION] [--no-checkout | -x]';
const ISSUE_TYPE = 'Task';

export function parseArgs(argv) {
  const result = { help: false, version: false, noCheckout: false, positionals: [] };
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

export function helpText() {
  return [
    'Usage: git-jira <PROJECT_KEY> <TITLE> [DESCRIPTION] [OPTIONS]',
    '',
    'Options:',
    '  -x, --no-checkout     Skip branch creation and checkout.',
    '  -v, --version         Show version information.',
    '  -h, --help            Show this help message.',
    '',
    'Environment variables:',
    '  JIRA_URL              The Jira base URL.',
    '  JIRA_EMAIL            Your Jira email.',
    '  JIRA_PAT              Your Jira Personal Access Token.',
    '',
  ].join('\n');
}

export async function main(argv, deps = {}) {
  const {
    env = process.env,
    fetchImpl = globalThis.fetch,
    execGit = defaultExecGit,
    stdout = write(process.stdout),
    stderr = write(process.stderr),
  } = deps;

  const { help, version, noCheckout, positionals } = parseArgs(argv);

  if (help) {
    stdout(helpText());
    return 0;
  }

  if (version) {
    stdout(`git-jira-fast-ticket version ${getVersion()}\n`);
    return 0;
  }

  const { JIRA_URL: baseUrl, JIRA_EMAIL: email, JIRA_PAT: pat } = env;
  if (!baseUrl || !email || !pat) {
    stderr(`${MISSING_ENV_MESSAGE}\n`);
    return 1;
  }

  if (positionals.length < 2) {
    stderr(`${USAGE_MESSAGE}\n`);
    return 1;
  }

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
