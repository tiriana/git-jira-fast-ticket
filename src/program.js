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
Object.defineProperty(exports, '__esModule', { value: true });
const commander_1 = require('commander');
const fromGitConfig_1 = require('./utils/fromGitConfig');
const readline_sync_1 = require('readline-sync');
const fs_1 = require('fs');
const questionAndSave_1 = require('@/questionAndSave');
const questionEMailAndSave_1 = require('@/questionEMailAndSave');
const fetchJiraProjects_1 = require('@/utils/fetchJiraProjects');
const jira_js_1 = require('jira.js');
const createJiraTicket_1 = require('@/utils/createJiraTicket');
const child_process_1 = require('child_process');
const packageJson = JSON.parse((0, fs_1.readFileSync)('./package.json', 'utf-8'));
const program = new commander_1.Command();
program
  .version(packageJson.version)
  .option('--pat <pat>', 'Jira personal access token')
  .option('-u, --url <url>', 'Jira URL')
  .option('-e, --email <email>', 'User email for Jira')
  .option('-p, --project <project>', 'Jira project ID')
  .option('-x, --no-checkout', 'Do not checkout to the new branch automatically')
  .arguments('[title] [description]')
  .action((title, description) =>
    __awaiter(void 0, void 0, void 0, function* () {
      const opts = program.opts();
      const pat =
        opts.pat ||
        process.env.JIRA_PAT ||
        (0, fromGitConfig_1.fromGitConfig)('jira.pat') ||
        (0, questionAndSave_1.questionAndSave)('Enter Jira personal access token:', 'jira.pat');
      const url =
        opts.url ||
        process.env.JIRA_URL ||
        (0, fromGitConfig_1.fromGitConfig)('jira.url') ||
        (0, questionAndSave_1.questionAndSave)('Enter Jira URL:', 'jira.url');
      const email =
        opts.email ||
        process.env.JIRA_EMAIL ||
        (0, fromGitConfig_1.fromGitConfig)('jira.email') ||
        (0, questionEMailAndSave_1.questionEMailAndSave)('Enter Jira email:', 'jira.email');
      let project = opts.project || process.env.JIRA_PROJECT || (0, fromGitConfig_1.fromGitConfig)('jira.project');
      const jiraClient = new jira_js_1.Version3Client({
        host: url,
        authentication: {
          basic: {
            email: email,
            apiToken: pat,
          },
        },
      });
      if (!project) {
        const allProjects = yield (0, fetchJiraProjects_1.fetchJiraProjects)(jiraClient);
        console.log(
          `Available Jira projects: [${allProjects
            .map(project => project.key)
            .sort((a, b) => a.localeCompare(b))
            .join(', ')}]`
        );
        while (!project) {
          project = (0, questionAndSave_1.questionAndSave)('Enter Project Key:', 'jira.project').toUpperCase();
        }
      }
      const wasTitleEmpty = !title;
      while (!title) {
        title = (0, readline_sync_1.question)('Enter the title for the Jira ticket:') || '';
      }
      description = wasTitleEmpty ? (0, readline_sync_1.question)('Enter description or leave empty [ENTER]:', { defaultInput: title }) : description || title;
      const issue = yield (0, createJiraTicket_1.createJiraTicket)(jiraClient, project.toUpperCase(), title, description);
      if (issue) {
        const issueKey = issue.key;
        const sanitizedTitle = title
          .replace(/[^a-zA-Z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .toLowerCase();
        const branchName = `${issueKey}-${sanitizedTitle}`;
        const checkoutCommand = `git checkout -b "${branchName}"`;
        if (!opts.noCheckout) {
          (0, child_process_1.execSync)(checkoutCommand);
        } else {
          console.log(`To create the branch manually, use:\n ${checkoutCommand}`);
        }
      }
    })
  );
program.parse(process.argv);
