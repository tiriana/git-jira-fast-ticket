import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { branchName, helpText, parseArgs, sanitizeBranchTitle } from '../src/cli.js';

describe('parseArgs', () => {
  it('recognizes long flags before positionals', () => {
    assert.deepEqual(parseArgs(['--no-checkout', 'PROJ', 'A title']), {
      help: false,
      version: false,
      noCheckout: true,
      configure: false,
      positionals: ['PROJ', 'A title'],
    });
  });

  it('recognizes short flags between positionals', () => {
    assert.deepEqual(parseArgs(['PROJ', '-x', 'A title']), {
      help: false,
      version: false,
      noCheckout: true,
      configure: false,
      positionals: ['PROJ', 'A title'],
    });
  });

  it('recognizes flags after positionals', () => {
    assert.deepEqual(parseArgs(['PROJ', 'A title', 'A description', '--help']), {
      help: true,
      version: false,
      noCheckout: false,
      configure: false,
      positionals: ['PROJ', 'A title', 'A description'],
    });
  });

  it('treats everything after -- as positional', () => {
    assert.deepEqual(parseArgs(['--help', '--', '--version', '-x']), {
      help: true,
      version: false,
      noCheckout: false,
      configure: false,
      positionals: ['--version', '-x'],
    });
  });

  it('treats unknown flags before -- as positionals', () => {
    assert.deepEqual(parseArgs(['--unknown', 'PROJ']), {
      help: false,
      version: false,
      noCheckout: false,
      configure: false,
      positionals: ['--unknown', 'PROJ'],
    });
  });

  it('accepts mixed short and long forms', () => {
    assert.deepEqual(parseArgs(['-v', '--no-checkout', 'PROJ', 'A title']), {
      help: false,
      version: true,
      noCheckout: true,
      configure: false,
      positionals: ['PROJ', 'A title'],
    });
  });

  it('recognizes --configure without treating it as positional', () => {
    assert.deepEqual(parseArgs(['--configure']), {
      help: false,
      version: false,
      noCheckout: false,
      configure: true,
      positionals: [],
    });
  });
});

describe('sanitizeBranchTitle', () => {
  it('collapses runs of spaces into single dashes', () => {
    assert.equal(sanitizeBranchTitle('Fix   the   bug'), 'Fix-the-bug');
  });

  it('replaces punctuation with dashes', () => {
    assert.equal(sanitizeBranchTitle('feat: add login/page'), 'feat-add-login-page');
  });

  it('strips leading and trailing separators', () => {
    assert.equal(sanitizeBranchTitle('  hello world!  '), 'hello-world');
    assert.equal(sanitizeBranchTitle('--already--'), 'already');
  });

  it('removes non-ascii characters', () => {
    assert.equal(sanitizeBranchTitle('café ☕ time'), 'caf-time');
  });

  it('preserves alphanumerics', () => {
    assert.equal(sanitizeBranchTitle('ABC123abc'), 'ABC123abc');
  });

  it('returns an empty string when nothing remains', () => {
    assert.equal(sanitizeBranchTitle('---'), '');
  });
});

describe('branchName', () => {
  it('joins the key and sanitized title with a dash', () => {
    assert.equal(branchName('ABC-1', 'Add login page'), 'ABC-1-Add-login-page');
  });
});

describe('helpText', () => {
  const config = {
    url: 'https://example.atlassian.net',
    email: 'dev@example.com',
    pat: 'super-secret-pat',
    issueType: 'Task',
    sources: {
      JIRA_URL: 'env',
      JIRA_EMAIL: 'local',
      JIRA_PAT: 'global',
      JIRA_ISSUE_TYPE: 'default',
    },
  };

  it('names the command users actually type', () => {
    assert.match(
      helpText(config),
      /Usage: git-jira-fast-ticket <PROJECT_KEY> <TITLE> \[DESCRIPTION\] \[OPTIONS\]/,
    );
  });

  it('lists the environment variables', () => {
    const text = helpText(config);
    assert.match(text, /JIRA_URL/);
    assert.match(text, /JIRA_EMAIL/);
    assert.match(text, /JIRA_PAT/);
  });

  it('shows per-key configuration status', () => {
    const text = helpText(config);
    assert.match(text, /JIRA_URL set \(environment\)/);
    assert.match(text, /JIRA_EMAIL set \(git config, this repository\)/);
    assert.match(text, /JIRA_PAT set \(git config, all repositories\)/);
  });

  it('documents the optional issue type and its Task default', () => {
    const text = helpText(config);
    assert.match(
      text,
      /JIRA_ISSUE_TYPE\s+The Jira issue type to create\. Optional, defaults to Task\./,
    );
    assert.match(text, /JIRA_ISSUE_TYPE set \(built-in default\)/);
  });

  it('never prints the PAT value', () => {
    assert.ok(!helpText(config).includes('super-secret-pat'));
  });
});
