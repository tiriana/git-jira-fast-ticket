const shell = require('shelljs');
const sinon = require('sinon');
const assert = require('assert');
const packageJson = require('./package.json');

describe('git-jira-fast-ticket Bash Script Tests', function() {
  let shellExecStub;

  beforeEach(function() {
    shellExecStub = sinon.stub(shell, 'exec');
  });

  afterEach(function() {
    shellExecStub.restore();
  });

  it('should fail when environment variables are missing', function() {
    shellExecStub.withArgs('./bin/git-jira-fast-ticket.sh "PROJECT_KEY" "Test Title"').returns({
      code: 1,
      stdout: 'Please set the JIRA_URL, JIRA_EMAIL, and JIRA_PAT environment variables',
    });

    const result = shell.exec('./bin/git-jira-fast-ticket.sh "PROJECT_KEY" "Test Title"');
    assert.strictEqual(result.code, 1);
    assert(result.stdout.includes('Please set the JIRA_URL, JIRA_EMAIL, and JIRA_PAT environment variables'));
  });

  it('should create a ticket and return the correct branch name', function() {
    shellExecStub.withArgs('./bin/git-jira-fast-ticket.sh "TEST" "Test Title" "Test Description"').returns({
      code: 0,
      stdout: 'Jira ticket created: TEST-123',
    });

    shellExecStub.withArgs('git checkout main').returns({ code: 0, stdout: 'Switched to branch main' });
    shellExecStub.withArgs('git branch -D TEST-123-Test-Title').returns({
      code: 0,
      stdout: 'Deleted branch TEST-123-Test-Title',
    });

    const result = shell.exec('./bin/git-jira-fast-ticket.sh "TEST" "Test Title" "Test Description"');
    assert.strictEqual(result.code, 0);
    assert(result.stdout.includes('Jira ticket created: TEST-123'));

    const checkoutResult = shell.exec('git checkout main');
    assert.strictEqual(checkoutResult.code, 0);
    assert(checkoutResult.stdout.includes('Switched to branch main'));

    const deleteBranchResult = shell.exec('git branch -D TEST-123-Test-Title');
    assert.strictEqual(deleteBranchResult.code, 0);
    assert(deleteBranchResult.stdout.includes('Deleted branch TEST-123-Test-Title'));
  });

  it('should display the version', function() {
    const expectedVersion = packageJson.version;

    shellExecStub.withArgs('./bin/git-jira-fast-ticket.sh --version').returns({
      code: 0,
      stdout: expectedVersion,
    });

    const result = shell.exec('./bin/git-jira-fast-ticket.sh --version');
    assert.strictEqual(result.code, 0);
    assert.strictEqual(result.stdout.trim(), expectedVersion);
  });

  it('should display the help', function() {
    shellExecStub.withArgs('./bin/git-jira-fast-ticket.sh --help').returns({
      code: 0,
      stdout: 'Usage: git-jira-fast-ticket <options>',
    });

    const result = shell.exec('./bin/git-jira-fast-ticket.sh --help');
    assert.strictEqual(result.code, 0);
    assert(result.stdout.includes('Usage: git-jira-fast-ticket <options>'));
  });
});
