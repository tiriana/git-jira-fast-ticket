export class JiraError extends Error {
  constructor(message, { status, body, hint } = {}) {
    super(message);
    this.name = 'JiraError';
    this.status = status;
    this.body = body;
    this.hint = hint;
  }
}

export function normalizeBaseUrl(baseUrl) {
  return baseUrl.replace(/\/+$/, '');
}

const STATUS_HINTS = {
  400: 'Check the summary and description being sent, and confirm the project accepts the configured issue type.',
  401: 'Check that JIRA_EMAIL and JIRA_PAT are correct.',
  403: 'Check that JIRA_EMAIL and JIRA_PAT are correct.',
  404: 'Check that JIRA_URL is correct and that the project key exists.',
  429: 'Jira is rate limiting requests; retry in a moment.',
};
const SERVER_HINT = 'Jira reported a server-side error; retry shortly.';
const NETWORK_HINT = 'Check that JIRA_URL is reachable and that this machine is online.';

function statusHint(status) {
  if (STATUS_HINTS[status]) {
    return STATUS_HINTS[status];
  }
  if (status >= 500) {
    return SERVER_HINT;
  }
  return undefined;
}

export function apiUrl(baseUrl) {
  return `${normalizeBaseUrl(baseUrl)}/rest/api/3/issue`;
}

export function buildPayload({ projectKey, title, description, issueType }) {
  return {
    fields: {
      project: { key: projectKey },
      summary: title,
      description: {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: description }],
          },
        ],
      },
      issuetype: { name: issueType },
    },
  };
}

export async function createIssue({
  baseUrl,
  email,
  pat,
  projectKey,
  title,
  description,
  issueType,
  fetchImpl = globalThis.fetch,
}) {
  const auth = Buffer.from(`${email}:${pat}`).toString('base64');

  let response;
  try {
    response = await fetchImpl(apiUrl(baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify(buildPayload({ projectKey, title, description, issueType })),
    });
  } catch (error) {
    throw new JiraError(errorMessage(error), { hint: NETWORK_HINT });
  }

  if (!response.ok) {
    const body = await readText(response);
    throw new JiraError(responseMessage(body, response.status), {
      status: response.status,
      body,
      hint: statusHint(response.status),
    });
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new JiraError(errorMessage(error), { status: response.status });
  }

  return { key: data.key };
}

async function readText(response) {
  try {
    return await response.text();
  } catch {
    return undefined;
  }
}

function responseMessage(body, status) {
  const parsed = parseJson(body);
  if (parsed && typeof parsed === 'object') {
    if (hasEntries(parsed.errors)) {
      return Object.entries(parsed.errors)
        .map(([field, message]) => `${field}: ${message}`)
        .join(', ');
    }
    if (Array.isArray(parsed.errorMessages) && parsed.errorMessages.length > 0) {
      return parsed.errorMessages.join(', ');
    }
  }
  return `HTTP ${status}`;
}

function hasEntries(value) {
  return value !== null && typeof value === 'object' && Object.keys(value).length > 0;
}

function parseJson(text) {
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
