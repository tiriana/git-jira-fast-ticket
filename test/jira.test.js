import assert from 'node:assert/strict';
import http from 'node:http';

import { JiraError, apiUrl, buildPayload, createIssue } from '../src/jira.js';

describe('buildPayload', () => {
  it('produces the Atlassian Document Format description', () => {
    const payload = buildPayload({
      projectKey: 'ABC',
      title: 'A title',
      description: 'A description',
      issueType: 'Task',
    });

    assert.deepEqual(payload, {
      fields: {
        project: { key: 'ABC' },
        summary: 'A title',
        description: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'A description' }],
            },
          ],
        },
        issuetype: { name: 'Task' },
      },
    });
  });

  it('keeps an empty description as an empty text node', () => {
    const payload = buildPayload({
      projectKey: 'ABC',
      title: 'A title',
      description: '',
      issueType: 'Task',
    });

    assert.equal(payload.fields.description.content[0].content[0].text, '');
  });

  it('round-trips special characters through JSON', () => {
    const description = 'quote " backslash \\ newline \n dollar $VAR non-ascii café';
    const payload = buildPayload({
      projectKey: 'ABC',
      title: 'A title',
      description,
      issueType: 'Task',
    });

    const parsed = JSON.parse(JSON.stringify(payload));
    assert.equal(parsed.fields.description.content[0].content[0].text, description);
  });
});

describe('apiUrl', () => {
  it('normalizes a single trailing slash', () => {
    assert.equal(apiUrl('https://example.atlassian.net/'), 'https://example.atlassian.net/rest/api/3/issue');
  });

  it('normalizes multiple trailing slashes', () => {
    assert.equal(apiUrl('https://example.atlassian.net///'), 'https://example.atlassian.net/rest/api/3/issue');
  });

  it('leaves a slash-free base URL with one slash', () => {
    assert.equal(apiUrl('https://example.atlassian.net'), 'https://example.atlassian.net/rest/api/3/issue');
  });
});

describe('createIssue', () => {
  let server;
  let baseUrl;
  let handler;

  before(async () => {
    server = http.createServer((req, res) => handler(req, res));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    handler = (req, res) => {
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ key: 'ABC-1' }));
    };
  });

  function params(overrides = {}) {
    return {
      baseUrl,
      email: 'dev@example.com',
      pat: 'secret',
      projectKey: 'ABC',
      title: 'A title',
      description: 'A description',
      issueType: 'Task',
      ...overrides,
    };
  }

  it('returns the key from a successful response', async () => {
    const result = await createIssue(params());
    assert.deepEqual(result, { key: 'ABC-1' });
  });

  it('sends HTTP basic auth and a JSON content type', async () => {
    let captured;
    handler = (req, res) => {
      captured = {
        authorization: req.headers.authorization,
        contentType: req.headers['content-type'],
      };
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ key: 'ABC-2' }));
    };

    const result = await createIssue(params());

    assert.equal(result.key, 'ABC-2');
    assert.equal(
      captured.authorization,
      `Basic ${Buffer.from('dev@example.com:secret').toString('base64')}`,
    );
    assert.equal(captured.contentType, 'application/json');
  });

  it('reports field errors from a 400 response', async () => {
    handler = (req, res) => {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ errors: { summary: 'is required' } }));
    };

    await assert.rejects(
      () => createIssue(params()),
      (error) => {
        assert.ok(error instanceof JiraError);
        assert.match(error.message, /summary/);
        assert.match(error.message, /is required/);
        assert.equal(error.status, 400);
        return true;
      },
    );
  });

  it('reports errorMessages from a 400 response', async () => {
    handler = (req, res) => {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ errorMessages: ['Field is invalid'] }));
    };

    await assert.rejects(
      () => createIssue(params()),
      (error) => {
        assert.ok(error instanceof JiraError);
        assert.match(error.message, /Field is invalid/);
        return true;
      },
    );
  });

  it('reports the status of a 401 response', async () => {
    handler = (req, res) => {
      res.writeHead(401);
      res.end('unauthorized');
    };

    await assert.rejects(
      () => createIssue(params()),
      (error) => {
        assert.ok(error instanceof JiraError);
        assert.equal(error.status, 401);
        return true;
      },
    );
  });

  it('wraps a network failure in a JiraError without a status', async () => {
    const failingFetch = () => Promise.reject(new Error('getaddrinfo ENOTFOUND'));

    await assert.rejects(
      () => createIssue(params({ fetchImpl: failingFetch })),
      (error) => {
        assert.ok(error instanceof JiraError);
        assert.match(error.message, /ENOTFOUND/);
        assert.equal(error.status, undefined);
        return true;
      },
    );
  });
});
