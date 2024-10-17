#!/usr/bin/env node
'use strict';
var __awaiter =
  (this && this.__awaiter) ||
  function (thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P
        ? value
        : new P(function (resolve) {
            resolve(value);
          });
    }
    return new (P || (P = Promise))(function (resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator['throw'](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
var _a, _b, _c, _d, _e, _f, _g, _h, _j;
Object.defineProperty(exports, '__esModule', { value: true });
const commander_1 = require('commander');
const child_process_1 = require('child_process');
const node_fetch_1 = require('node-fetch'); // Install with `npm install node-fetch`
const fromGitConfig_1 = require('./utils/fromGitConfig');
const program = new commander_1.Command();
program
  .version('1.0.0')
  .requiredOption(
    '--pat <pat>',
    'Jira personal access token',
    (_b = (_a = process.env.JIRA_PAT) !== null && _a !== void 0 ? _a : (0, fromGitConfig_1.fromGitConfig)('jira.pat')) !== null && _b !== void 0 ? _b : ''
  )
  .option(
    '-u, --url <url>',
    'Jira URL',
    (_d = (_c = process.env.JIRA_URL) !== null && _c !== void 0 ? _c : (0, fromGitConfig_1.fromGitConfig)('jira.url')) !== null && _d !== void 0 ? _d : ''
  )
  .option(
    '-e, --email <email>',
    'User email for Jira',
    (_g =
      (_f = (_e = process.env.JIRA_EMAIL) !== null && _e !== void 0 ? _e : (0, fromGitConfig_1.fromGitConfig)('jira.email')) !== null && _f !== void 0
        ? _f
        : (0, fromGitConfig_1.fromGitConfig)('user.email')) !== null && _g !== void 0
      ? _g
      : ''
  )
  .option(
    '-p, --project <project>',
    'Jira project ID',
    (_j = (_h = process.env.JIRA_PROJECT) !== null && _h !== void 0 ? _h : (0, fromGitConfig_1.fromGitConfig)('jira.project')) !== null && _j !== void 0
      ? _j
      : ''
  )
  .arguments('<title> [description]')
  .action((title, description) =>
    __awaiter(void 0, void 0, void 0, function* () {
      const opts = program.opts();
      const pat = opts.pat;
      const url = opts.url || prompt('Enter your Jira URL:');
      const email = opts.email || prompt('Enter your email for Jira:');
      const project = opts.project || prompt('Enter the Jira project ID:');
      console.log({
        pat,
        url,
        email,
        project,
      });
      return;
      if (!title) {
        console.error('Error: Title is required.');
        process.exit(1);
      }
      description = description || title;
      // Create Jira ticket JSON payload
      const descriptionJson = {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: description,
              },
            ],
          },
        ],
      };
      const payload = {
        fields: {
          project: { key: project },
          summary: title,
          description: descriptionJson,
          issuetype: { name: 'Task' },
        },
      };
      // Send POST request to Jira API
      try {
        const response = yield (0, node_fetch_1.default)(`${url}/rest/api/3/issue`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${Buffer.from(`${email}:${pat}`).toString('base64')}`,
          },
          body: JSON.stringify(payload),
        });
        const responseData = yield response.json();
        if (!response.ok) {
          console.error('Failed to create Jira ticket:', responseData.errors || responseData);
          process.exit(1);
        }
        const ticketId = responseData.key;
        const ticketUrl = `${url}/browse/${ticketId}`;
        console.log(`Jira ticket created: ${ticketId} - ${ticketUrl}`);
        // Create a sanitized branch name
        const sanitizedTitle = title.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        const branchName = `${ticketId}-${sanitizedTitle}`;
        // Check if the user wants to create a new branch
        if (opts.checkout !== false) {
          // if --no-checkout is not specified
          (0, child_process_1.execSync)(`git checkout -b ${branchName}`, { stdio: 'inherit' });
        } else {
          console.log(`Use this command to switch to the new branch: git checkout -b ${branchName}`);
        }
      } catch (error) {
        console.error('Error creating Jira ticket:', error.message);
        process.exit(1);
      }
    })
  );
program.parse(process.argv);
