#!/usr/bin/env node

const https = require('https');
const { execSync } = require('child_process');
const fs = require('fs');

const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
const VERSION_NUMBER = packageJson.version;

const args = process.argv.slice(2);
let NO_CHECKOUT = false;
let VERSION = false;
let SHOW_HELP = false;
let SHOW_CONFIG = false;

function showHelp() {
  console.log('Usage: git-jira <PROJECT_KEY> <TITLE> [DESCRIPTION] [OPTIONS]\n');
  console.log('Options:');
  console.log('  -x, --no-checkout     Skip branch creation and checkout.');
  console.log('  -v, --version         Show version information.');
  console.log('  -h, --help            Show this help message.');
  console.log('  -c, --config          Show current configuration.\n');
  console.log('Environment variables:');
  console.log('  JIRA_URL              The Jira base URL.');
  console.log('  JIRA_EMAIL            Your Jira email.');
  console.log('  JIRA_PAT              Your Jira Personal Access Token.');
}

function showConfig() {
  const { JIRA_URL, JIRA_EMAIL, JIRA_PAT } = process.env;

  console.log('\nCurrent Configuration:');
  console.log('=====================');
  console.log('Version:', VERSION_NUMBER);
  console.log('\nEnvironment Variables:');
  console.log('JIRA_URL:', JIRA_URL ? '\x1b[32m✓ Set\x1b[0m' : '\x1b[31m✗ Not Set\x1b[0m');
  console.log('JIRA_EMAIL:', JIRA_EMAIL ? '\x1b[32m✓ Set\x1b[0m' : '\x1b[31m✗ Not Set\x1b[0m');
  console.log('JIRA_PAT:', JIRA_PAT ? '\x1b[32m✓ Set\x1b[0m' : '\x1b[31m✗ Not Set\x1b[0m');

  if (JIRA_URL) console.log('\nJIRA_URL Value:', JIRA_URL);
  if (JIRA_EMAIL) console.log('JIRA_EMAIL Value:', JIRA_EMAIL);
  if (JIRA_PAT) console.log('JIRA_PAT Value:', '********' + JIRA_PAT.slice(-4));

  try {
    const gitUser = execSync('git config user.name').toString().trim();
    const gitEmail = execSync('git config user.email').toString().trim();
    console.log('\nGit Configuration:');
    console.log('Git User:', gitUser);
    console.log('Git Email:', gitEmail);
  } catch (error) {
    console.log('\nGit Configuration: \x1b[31m✗ Not available\x1b[0m');
  }
}

const parsedArgs = [];
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  switch (arg) {
    case '-x':
    case '--no-checkout':
      NO_CHECKOUT = true;
      break;
    case '-v':
    case '--version':
      VERSION = true;
      break;
    case '-h':
    case '--help':
      SHOW_HELP = true;
      break;
    case '-c':
    case '--config':
      SHOW_CONFIG = true;
      break;
    default:
      parsedArgs.push(arg);
  }
}

if (SHOW_HELP) {
  showHelp();
  process.exit(0);
}

if (VERSION) {
  console.log(`git-jira-fast-ticket version ${VERSION_NUMBER}`);
  process.exit(0);
}

if (SHOW_CONFIG) {
  showConfig();
  process.exit(0);
}

const { JIRA_URL, JIRA_EMAIL, JIRA_PAT } = process.env;
if (!JIRA_URL || !JIRA_EMAIL || !JIRA_PAT) {
  console.error('Please set the JIRA_URL, JIRA_EMAIL, and JIRA_PAT environment variables.');
  console.log('\nCurrent configuration status:');
  showConfig();
  process.exit(1);
}

if (parsedArgs.length < 2) {
  console.error('Usage: git-jira <PROJECT_KEY> <TITLE> [DESCRIPTION] [--no-checkout | -x]');
  process.exit(1);
}

const [PROJECT_KEY, TITLE] = parsedArgs;
const DESCRIPTION = parsedArgs[2] || TITLE;

const DESCRIPTION_JSON = {
  type: 'doc',
  version: 1,
  content: [{
    type: 'paragraph',
    content: [{
      type: 'text',
      text: DESCRIPTION,
    }],
  }],
};

const requestData = {
  fields: {
    project: { key: PROJECT_KEY },
    summary: TITLE,
    description: DESCRIPTION_JSON,
    issuetype: { name: 'Task' },
  },
};

function makeJiraRequest() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: new URL(JIRA_URL).hostname,
      path: '/rest/api/3/issue',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_PAT}`).toString('base64')}`,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve(response);
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify(requestData));
    req.end();
  });
}

async function main() {
  try {
    const response = await makeJiraRequest();

    if (!response.key) {
      console.error('Error creating Jira ticket:', response.errors || response);
      process.exit(1);
    }

    const TICKET_ID = response.key;
    const TICKET_URL = `${JIRA_URL}/browse/${TICKET_ID}`;
    console.log(`Jira ticket created: ${TICKET_ID} - \x1b[34m${TICKET_URL}\x1b[0m`);

    // Create branch name
    const SANITIZED_TITLE = TITLE.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const BRANCH_NAME = `${TICKET_ID}-${SANITIZED_TITLE}`;

    if (!NO_CHECKOUT) {
      try {
        execSync(`git checkout -b "${BRANCH_NAME}"`, { stdio: 'inherit' });
      } catch (error) {
        console.error('Failed to create and checkout branch:', error.message);
        process.exit(1);
      }
    } else {
      console.log(`Branch creation and checkout skipped. You can manually create the branch: git checkout -b "${BRANCH_NAME}"`);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
