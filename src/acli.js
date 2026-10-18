import { execFile } from 'node:child_process';

export const BACKENDS = ['acli', 'api'];

const STDERR_LIMIT = 300;

export function defaultRunAcli(args, { env } = {}) {
  return new Promise((resolve) => {
    execFile(
      'acli',
      args,
      { env: { ...(env ?? process.env), NO_COLOR: '1' } },
      (error, stdout, stderr) => {
        if (error && error.code === 'ENOENT') {
          resolve({ ok: false, stdout: '', stderr: '', missing: true });
          return;
        }
        resolve({ ok: !error, stdout: stdout ?? '', stderr: stderr ?? '', missing: false });
      },
    );
  });
}

// acli exposes no --json for auth status: only its exit code tells us whether
// the backend is usable, and its stdout must not be parsed.
export async function detectAcli({ runAcli = defaultRunAcli, env } = {}) {
  const result = await runAcli(['jira', 'auth', 'status'], { env });
  if (result.missing) {
    return 'missing';
  }
  return result.ok ? 'usable' : 'unauthenticated';
}

export function acliUnusableMessage(status) {
  if (status === 'missing') {
    return 'acli is not on PATH. Install the Atlassian CLI, or set JIRA_BACKEND=api to use the REST API.';
  }
  return "acli is not authenticated. Run 'acli jira auth login' to authenticate, or set JIRA_BACKEND=api to use the REST API.";
}

export async function selectBackend({ backend, pat, detect } = {}) {
  if (backend !== undefined && backend !== '' && !BACKENDS.includes(backend)) {
    throw new Error(
      `Invalid JIRA_BACKEND value "${backend}". Accepted values: ${BACKENDS.join(', ')}.`,
    );
  }

  if (backend === 'acli') {
    const status = await detect();
    if (status !== 'usable') {
      throw new Error(acliUnusableMessage(status));
    }
    return 'acli';
  }

  if (backend === 'api') {
    return 'api';
  }

  if (typeof pat === 'string' && pat !== '') {
    return 'api';
  }

  const status = await detect();
  return status === 'usable' ? 'acli' : 'api';
}

export function buildCreateArgs({ projectKey, title, description, issueType }) {
  const args = [
    'jira',
    'workitem',
    'create',
    '--summary',
    title,
    '--project',
    projectKey,
    '--type',
    issueType,
  ];

  if (typeof description === 'string' && description !== '') {
    args.push('--description', description);
  }

  args.push('--json');
  return args;
}

export function extractKey(stdout) {
  let data;
  try {
    data = JSON.parse(stdout);
  } catch {
    return undefined;
  }

  if (data !== null && typeof data === 'object' && typeof data.key === 'string' && data.key !== '') {
    return data.key;
  }
  return undefined;
}

export async function createIssueWithAcli({
  projectKey,
  title,
  description,
  issueType,
  runAcli = defaultRunAcli,
  env,
} = {}) {
  const result = await runAcli(buildCreateArgs({ projectKey, title, description, issueType }), {
    env,
  });

  if (result.missing) {
    throw new Error(acliUnusableMessage('missing'));
  }

  if (!result.ok) {
    const detail = truncate((result.stderr || result.stdout).trim());
    throw new Error(
      detail === ''
        ? 'acli failed to create the Jira work item.'
        : `acli failed to create the Jira work item: ${detail}`,
    );
  }

  const key = extractKey(result.stdout);
  if (key === undefined) {
    throw new Error(
      'acli did not report a work item key, so no branch name can be derived. Re-run with JIRA_BACKEND=api to use the REST API.',
    );
  }

  return { key };
}

function truncate(text) {
  return text.length > STDERR_LIMIT ? `${text.slice(0, STDERR_LIMIT)}...` : text;
}
