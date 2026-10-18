import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCreateArgs,
  createIssueWithAcli,
  detectAcli,
  extractKey,
  selectBackend,
} from '../src/acli.js';

function runner(handler) {
  const calls = [];
  const run = async (args, options) => {
    calls.push({ args, options });
    return handler(args, options);
  };
  run.calls = calls;
  return run;
}

describe('detectAcli', () => {
  it('reports usable when the auth status command exits zero', async () => {
    const runAcli = runner(() => ({ ok: true, stdout: '', stderr: '' }));

    assert.equal(await detectAcli({ runAcli }), 'usable');
    assert.deepEqual(runAcli.calls[0].args, ['jira', 'auth', 'status']);
  });

  it('reports unauthenticated when the auth status command exits non-zero', async () => {
    const runAcli = runner(() => ({ ok: false, stdout: '', stderr: 'unauthorized' }));

    assert.equal(await detectAcli({ runAcli }), 'unauthenticated');
  });

  it('reports missing when the binary is absent', async () => {
    const runAcli = runner(() => ({ ok: false, stdout: '', stderr: '', missing: true }));

    assert.equal(await detectAcli({ runAcli }), 'missing');
  });
});

describe('buildCreateArgs', () => {
  it('builds the workitem create call ending in --json', () => {
    assert.deepEqual(
      buildCreateArgs({
        projectKey: 'ABC',
        title: 'A title',
        description: 'A description',
        issueType: 'Task',
      }),
      [
        'jira',
        'workitem',
        'create',
        '--summary',
        'A title',
        '--project',
        'ABC',
        '--type',
        'Task',
        '--description',
        'A description',
        '--json',
      ],
    );
  });

  it('omits --description for an empty description', () => {
    const args = buildCreateArgs({
      projectKey: 'ABC',
      title: 'A title',
      description: '',
      issueType: 'Task',
    });

    assert.ok(!args.includes('--description'), args.join(' '));
    assert.equal(args[args.length - 1], '--json');
  });
});

describe('extractKey', () => {
  it('returns the key from the JSON payload', () => {
    assert.equal(extractKey('{"id":"1","key":"ABC-9"}'), 'ABC-9');
  });

  it('returns undefined for non-JSON output', () => {
    assert.equal(extractKey('Created ABC-9'), undefined);
  });

  it('returns undefined when the key is absent', () => {
    assert.equal(extractKey('{"id":"1"}'), undefined);
  });

  it('returns undefined when the key is not a non-empty string', () => {
    assert.equal(extractKey('{"key":""}'), undefined);
    assert.equal(extractKey('{"key":42}'), undefined);
  });
});

describe('createIssueWithAcli', () => {
  function params(overrides = {}) {
    return {
      projectKey: 'ABC',
      title: 'A title',
      description: 'A description',
      issueType: 'Task',
      ...overrides,
    };
  }

  it('returns the key from a successful call', async () => {
    const runAcli = runner(() => ({ ok: true, stdout: '{"key":"ABC-1"}', stderr: '' }));

    const result = await createIssueWithAcli(params({ runAcli }));

    assert.deepEqual(result, { key: 'ABC-1' });
    assert.ok(runAcli.calls[0].args.includes('--json'));
  });

  it('passes the environment through to the runner', async () => {
    const runAcli = runner(() => ({ ok: true, stdout: '{"key":"ABC-1"}', stderr: '' }));
    const env = { PATH: '/usr/bin' };

    await createIssueWithAcli(params({ runAcli, env }));

    assert.equal(runAcli.calls[0].options.env, env);
  });

  it('throws with the truncated stderr when acli fails', async () => {
    const stderr = 'x'.repeat(500);
    const runAcli = runner(() => ({ ok: false, stdout: '', stderr }));

    await assert.rejects(() => createIssueWithAcli(params({ runAcli })), (error) => {
      assert.match(error.message, /acli failed to create the Jira work item/);
      assert.ok(error.message.includes('x'.repeat(300)), 'keeps the head of stderr');
      assert.ok(!error.message.includes('x'.repeat(301)), 'truncates the tail');
      return true;
    });
  });

  it('throws an actionable error when the response has no key', async () => {
    const runAcli = runner(() => ({ ok: true, stdout: '{"id":"1"}', stderr: '' }));

    await assert.rejects(() => createIssueWithAcli(params({ runAcli })), (error) => {
      assert.match(error.message, /work item key/);
      return true;
    });
  });

  it('throws a "not on PATH" error when the binary is missing', async () => {
    const runAcli = runner(() => ({ ok: false, stdout: '', stderr: '', missing: true }));

    await assert.rejects(() => createIssueWithAcli(params({ runAcli })), (error) => {
      assert.match(error.message, /not on PATH/);
      return true;
    });
  });
});

describe('selectBackend', () => {
  const usable = async () => 'usable';
  const unauthenticated = async () => 'unauthenticated';
  const missing = async () => 'missing';

  it('honors an explicit api backend without detecting', async () => {
    let called = false;
    const detect = async () => {
      called = true;
      return 'usable';
    };

    assert.equal(await selectBackend({ backend: 'api', detect }), 'api');
    assert.equal(called, false);
  });

  it('honors an explicit acli backend when it is usable', async () => {
    assert.equal(await selectBackend({ backend: 'acli', detect: usable }), 'acli');
  });

  it('fails with the login hint when acli is forced but unauthenticated', async () => {
    await assert.rejects(() => selectBackend({ backend: 'acli', detect: unauthenticated }), (error) => {
      assert.match(error.message, /acli jira auth login/);
      return true;
    });
  });

  it('fails when acli is forced but not installed', async () => {
    await assert.rejects(() => selectBackend({ backend: 'acli', detect: missing }), (error) => {
      assert.match(error.message, /not on PATH/);
      return true;
    });
  });

  it('rejects an unknown backend value', async () => {
    await assert.rejects(() => selectBackend({ backend: 'rest', detect: usable }), (error) => {
      assert.match(error.message, /Invalid JIRA_BACKEND value "rest"/);
      assert.match(error.message, /acli, api/);
      return true;
    });
  });

  it('selects acli automatically when it is usable and no PAT is configured', async () => {
    assert.equal(await selectBackend({ detect: usable }), 'acli');
  });

  it('falls back to api automatically when acli is not usable', async () => {
    assert.equal(await selectBackend({ detect: unauthenticated }), 'api');
    assert.equal(await selectBackend({ detect: missing }), 'api');
  });

  it('keeps the api backend when a PAT is configured even if acli is usable', async () => {
    assert.equal(await selectBackend({ pat: 'secret', detect: usable }), 'api');
  });
});
