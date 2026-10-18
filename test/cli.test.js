import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { branchName, helpText, parseArgs, sanitizeBranchTitle } from '../src/cli.js';

describe('parseArgs', () => {
  it('recognizes long flags before positionals', () => {
    assert.deepEqual(parseArgs(['--no-checkout', 'PROJ', 'A title']), {
      help: false,
      version: false,
      noCheckout: true,
      positionals: ['PROJ', 'A title'],
    });
  });

  it('recognizes short flags between positionals', () => {
    assert.deepEqual(parseArgs(['PROJ', '-x', 'A title']), {
      help: false,
      version: false,
      noCheckout: true,
      positionals: ['PROJ', 'A title'],
    });
  });

  it('recognizes flags after positionals', () => {
    assert.deepEqual(parseArgs(['PROJ', 'A title', 'A description', '--help']), {
      help: true,
      version: false,
      noCheckout: false,
      positionals: ['PROJ', 'A title', 'A description'],
    });
  });

  it('treats everything after -- as positional', () => {
    assert.deepEqual(parseArgs(['--help', '--', '--version', '-x']), {
      help: true,
      version: false,
      noCheckout: false,
      positionals: ['--version', '-x'],
    });
  });

  it('treats unknown flags before -- as positionals', () => {
    assert.deepEqual(parseArgs(['--unknown', 'PROJ']), {
      help: false,
      version: false,
      noCheckout: false,
      positionals: ['--unknown', 'PROJ'],
    });
  });

  it('accepts mixed short and long forms', () => {
    assert.deepEqual(parseArgs(['-v', '--no-checkout', 'PROJ', 'A title']), {
      help: false,
      version: true,
      noCheckout: true,
      positionals: ['PROJ', 'A title'],
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
  it('contains the usage line', () => {
    assert.match(helpText(), /Usage: git-jira <PROJECT_KEY> <TITLE> \[DESCRIPTION\] \[OPTIONS\]/);
  });

  it('lists the environment variables', () => {
    const text = helpText();
    assert.match(text, /JIRA_URL/);
    assert.match(text, /JIRA_EMAIL/);
    assert.match(text, /JIRA_PAT/);
  });
});
