import { execFile } from 'node:child_process';
import { join, resolve } from 'node:path';

export const CONFIG_SECTION = 'jira-fast-ticket';

const SETTINGS = [
  { env: 'JIRA_URL', git: 'url', field: 'url', required: true },
  { env: 'JIRA_EMAIL', git: 'email', field: 'email', required: true },
  { env: 'JIRA_PAT', git: 'token', field: 'pat', required: true },
  { env: 'JIRA_ISSUE_TYPE', git: 'issueType', field: 'issueType', default: 'Task' },
];

export function configKey(field) {
  return `${CONFIG_SECTION}.${field}`;
}

export async function resolveConfig({
  env = process.env,
  cwd = process.cwd(),
  runGit = defaultRunGit,
} = {}) {
  const localConfigPath = await resolveLocalConfigPath(cwd, env, runGit);
  const config = { url: undefined, email: undefined, pat: undefined, issueType: undefined, sources: {} };

  for (const { env: envKey, git, field, default: fallback } of SETTINGS) {
    if (env[envKey] !== undefined && env[envKey] !== '') {
      config[field] = env[envKey];
      config.sources[envKey] = 'env';
      continue;
    }

    const { value, source } = await readGitValue(configKey(git), {
      cwd,
      env,
      runGit,
      localConfigPath,
    });
    config[field] = value === undefined ? fallback : value;
    config.sources[envKey] = value === undefined && fallback !== undefined ? 'default' : source;
  }

  return config;
}

export function missingRequired(config) {
  return SETTINGS.filter(
    (setting) => setting.required === true && config.sources[setting.env] === undefined,
  ).map((setting) => setting.env);
}

export function formatMissing(missing) {
  const lines = [`Missing required configuration: ${missing.join(', ')}.`, 'Set them with:'];

  for (const key of missing) {
    const { git } = SETTINGS.find((setting) => setting.env === key);
    lines.push(`  git config --global ${configKey(git)} <value>`);
  }

  lines.push('Environment variables of the same names are also read and take precedence.');
  return lines.join('\n');
}

async function readGitValue(key, { cwd, env, runGit, localConfigPath }) {
  const result = await runGitSafe(runGit, ['config', '--show-origin', '--get', key], { cwd, env });
  if (!result || !result.ok) {
    return { value: undefined, source: undefined };
  }

  const line = result.stdout.split('\n')[0];
  const separator = line.indexOf('\t');
  if (separator === -1) {
    return { value: undefined, source: undefined };
  }

  const origin = line.slice(0, separator);
  const value = line.slice(separator + 1);
  const originPath = origin.startsWith('file:') ? origin.slice('file:'.length) : origin;
  const source =
    localConfigPath !== undefined && resolve(cwd, originPath) === localConfigPath
      ? 'local'
      : 'global';

  return { value, source };
}

async function resolveLocalConfigPath(cwd, env, runGit) {
  const result = await runGitSafe(runGit, ['rev-parse', '--git-common-dir'], { cwd, env });
  if (!result || !result.ok) {
    return undefined;
  }

  const dir = result.stdout.trim();
  return dir === '' ? undefined : join(resolve(cwd, dir), 'config');
}

async function runGitSafe(runGit, args, options) {
  try {
    return await runGit(args, options);
  } catch {
    return undefined;
  }
}

export function defaultRunGit(args, { cwd, env } = {}) {
  return new Promise((resolveResult) => {
    execFile('git', args, { cwd, env }, (error, stdout, stderr) => {
      resolveResult({ ok: !error, stdout: stdout ?? '', stderr: stderr ?? '' });
    });
  });
}
