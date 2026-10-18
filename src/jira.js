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
    throw new JiraError(errorMessage(error));
  }

  if (!response.ok) {
    const body = await readText(response);
    throw new JiraError(responseMessage(body, response.status), {
      status: response.status,
      body,
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
