const { expect } = require('chai');
const sinon = require('sinon');
const fs = require('fs');
const https = require('https');
const { EventEmitter } = require('events');
const childProcess = require('child_process');

// Import the main script (assuming it's exported properly)
// You'll need to modify the original script to export its functions
const {
  showHelp,
  showConfig,
  resolveCredentials,
  getGitConfig,
  makeJiraRequest,
  main,
} = require('./git-jira');

describe('Git Jira Script', () => {
  let sandbox;
  let processStub;
  let consoleStub;
  let httpsStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    // Stub process
    processStub = {
      env: {},
      exit: sandbox.stub(),
      argv: ['node', 'script.js'],
    };

    // Stub console
    consoleStub = {
      log: sandbox.stub(),
      error: sandbox.stub(),
    };

    // Stub fs
    sandbox.stub(fs, 'readFileSync').returns('{"version": "1.0.0"}');

    // Reset stubs for each test
    sandbox.stub(process, 'exit');
    sandbox.stub(console, 'log');
    sandbox.stub(console, 'error');
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('Credential Resolution', () => {
    it('should prioritize command line arguments over environment variables', () => {
      const args = [
        '--url=https://cli.atlassian.net',
        '--email=cli@example.com',
        '--pat=cli-token',
      ];

      process.env.JIRA_URL = 'https://env.atlassian.net';
      process.env.JIRA_EMAIL = 'env@example.com';
      process.env.JIRA_PAT = 'env-token';

      sandbox.stub(childProcess, 'execSync')
        .withArgs('git config --get jira.url').returns('https://git.atlassian.net')
        .withArgs('git config --get jira.email').returns('git@example.com')
        .withArgs('git config --get jira.pat').returns('git-token');

      const credentials = resolveCredentials(args);

      expect(credentials.url).to.equal('https://cli.atlassian.net');
      expect(credentials.email).to.equal('cli@example.com');
      expect(credentials.pat).to.equal('cli-token');
    });

    it('should fall back to environment variables if no CLI args', () => {
      const args = [];

      process.env.JIRA_URL = 'https://env.atlassian.net';
      process.env.JIRA_EMAIL = 'env@example.com';
      process.env.JIRA_PAT = 'env-token';

      sandbox.stub(childProcess, 'execSync')
        .withArgs('git config --get jira.url').returns('https://git.atlassian.net')
        .withArgs('git config --get jira.email').returns('git@example.com')
        .withArgs('git config --get jira.pat').returns('git-token');

      const credentials = resolveCredentials(args);

      expect(credentials.url).to.equal('https://env.atlassian.net');
      expect(credentials.email).to.equal('env@example.com');
      expect(credentials.pat).to.equal('env-token');
    });

    it('should fall back to git config if no CLI args or env vars', () => {
      const args = [];

      process.env = {};

      sandbox.stub(childProcess, 'execSync')
        .withArgs('git config --get jira.url').returns('https://git.atlassian.net')
        .withArgs('git config --get jira.email').returns('git@example.com')
        .withArgs('git config --get jira.pat').returns('git-token');

      const credentials = resolveCredentials(args);

      expect(credentials.url).to.equal('https://git.atlassian.net');
      expect(credentials.email).to.equal('git@example.com');
      expect(credentials.pat).to.equal('git-token');
    });
  });

  describe('Command Line Arguments', () => {
    it('should show help when --help flag is provided', () => {
      const args = ['--help'];
      showHelp();
      expect(console.log.called).to.be.true;
      expect(process.exit.calledWith(0)).to.be.true;
    });

    it('should show version when --version flag is provided', () => {
      const args = ['--version'];
      expect(console.log.calledWith('git-jira-fast-ticket version 1.0.0')).to.be.true;
      expect(process.exit.calledWith(0)).to.be.true;
    });

    it('should show config when --config flag is provided', () => {
      const args = ['--config'];
      showConfig();
      expect(console.log.called).to.be.true;
      expect(process.exit.calledWith(0)).to.be.true;
    });
  });

  describe('Jira API Integration', () => {
    let requestStub;
    let responseStub;

    beforeEach(() => {
      responseStub = new EventEmitter();
      requestStub = new EventEmitter();
      requestStub.write = sandbox.stub();
      requestStub.end = sandbox.stub();

      sandbox.stub(https, 'request').callsFake((options, callback) => {
        callback(responseStub);
        return requestStub;
      });
    });

    it('should create a Jira ticket successfully', async () => {
      const mockResponse = {
        key: 'PROJ-123',
      };

      const credentials = {
        url: 'https://jira.atlassian.net',
        email: 'test@example.com',
        pat: 'token123',
      };

      const promise = makeJiraRequest(credentials, {
        fields: {
          project: { key: 'PROJ' },
          summary: 'Test Ticket',
          description: { type: 'doc', version: 1, content: [] },
          issuetype: { name: 'Task' },
        },
      });

      responseStub.emit('data', JSON.stringify(mockResponse));
      responseStub.emit('end');

      const response = await promise;
      expect(response.key).to.equal('PROJ-123');
    });

    it('should handle Jira API errors', async () => {
      const mockError = {
        errors: {
          summary: 'Summary is required',
        },
      };

      const promise = makeJiraRequest({
        url: 'https://jira.atlassian.net',
        email: 'test@example.com',
        pat: 'token123',
      }, {});

      responseStub.emit('data', JSON.stringify(mockError));
      responseStub.emit('end');

      try {
        await promise;
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Summary is required');
      }
    });
  });

  describe('Git Integration', () => {
    beforeEach(() => {
      sandbox.stub(childProcess, 'execSync');
    });

    it('should create and checkout a new branch', async () => {
      const branchName = 'PROJ-123-test-ticket';

      childProcess.execSync
        .withArgs(`git checkout -b "${branchName}"`)
        .returns(null);

      await main(['PROJ', 'Test Ticket']);

      expect(childProcess.execSync.calledWith(`git checkout -b "${branchName}"`))
        .to.be.true;
    });

    it('should skip branch checkout when --no-checkout is provided', async () => {
      await main(['--no-checkout', 'PROJ', 'Test Ticket']);

      expect(childProcess.execSync.called).to.be.false;
      expect(console.log.calledWith(sinon.match(/Branch creation and checkout skipped/)))
        .to.be.true;
    });
  });

  describe('Error Handling', () => {
    it('should handle missing credentials', () => {
      process.env = {};
      sandbox.stub(childProcess, 'execSync').throws();

      const args = ['PROJ', 'Test Ticket'];

      main(args);

      expect(console.error.calledWith(sinon.match(/Missing Jira credentials/)))
        .to.be.true;
      expect(process.exit.calledWith(1)).to.be.true;
    });

    it('should handle invalid project key', () => {
      const args = [];

      main(args);

      expect(console.error.calledWith(sinon.match(/Usage: git-jira/)))
        .to.be.true;
      expect(process.exit.calledWith(1)).to.be.true;
    });

    it('should handle git errors', async () => {
      childProcess.execSync
        .withArgs(sinon.match(/git checkout/))
        .throws(new Error('Git error'));

      try {
        await main(['PROJ', 'Test Ticket']);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Git error');
        expect(process.exit.calledWith(1)).to.be.true;
      }
    });
  });
});
