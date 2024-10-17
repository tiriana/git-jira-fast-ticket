#!/usr/bin/env node
import { Command } from 'commander';
import { fromGitConfig } from './utils/fromGitConfig';
import { question } from 'readline-sync';
import { readFileSync } from 'fs';
import { questionAndSave } from '@/utils/questionAndSave';
import { questionEMailAndSave } from '@/utils/questionEMailAndSave';
import { fetchJiraProjects } from '@/utils/fetchJiraProjects';
import { Version3Client } from 'jira.js';
import { createJiraTicket } from '@/utils/createJiraTicket';
import { execSync } from 'child_process';
const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'));
const program = new Command();
program
  .version(packageJson.version)
  .option('--pat <pat>', 'Jira personal access token')
  .option('-u, --url <url>', 'Jira URL')
  .option('-e, --email <email>', 'User email for Jira')
  .option('-p, --project <project>', 'Jira project ID')
  .option('-x, --no-checkout', 'Do not checkout to the new branch automatically')
  .arguments('[title] [description]')
  .action(async (title, description) => {
    const opts = program.opts();
    const pat = opts.pat || process.env.JIRA_PAT || fromGitConfig('jira.pat') || questionAndSave('Enter Jira personal access token:', 'jira.pat');
    const url = opts.url || process.env.JIRA_URL || fromGitConfig('jira.url') || questionAndSave('Enter Jira URL:', 'jira.url');
    const email = opts.email || process.env.JIRA_EMAIL || fromGitConfig('jira.email') || questionEMailAndSave('Enter Jira email:', 'jira.email');
    let project = opts.project || process.env.JIRA_PROJECT || fromGitConfig('jira.project');
    const jiraClient = new Version3Client({
      host: url,
      authentication: {
        basic: {
          email: email,
          apiToken: pat,
        },
      },
    });
    if (!project) {
      const allProjects = await fetchJiraProjects(jiraClient);
      console.log(
        `Available Jira projects: [${allProjects
          .map(project => project.key)
          .sort((a, b) => a.localeCompare(b))
          .join(', ')}]`
      );
      while (!project) {
        project = questionAndSave('Enter Project Key:', 'jira.project').toUpperCase();
      }
    }
    const wasTitleEmpty = !title;
    while (!title) {
      title = question('Enter the title for the Jira ticket:') || '';
    }
    description = wasTitleEmpty ? question('Enter description or leave empty [ENTER]:', { defaultInput: title }) : description || title;
    const issue = await createJiraTicket(jiraClient, project.toUpperCase(), title, description);
    if (issue) {
      const issueKey = issue.key;
      const sanitizedTitle = title
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
      const branchName = `${issueKey}-${sanitizedTitle}`;
      const checkoutCommand = `git checkout -b "${branchName}"`;
      if (!opts.noCheckout) {
        execSync(checkoutCommand);
      } else {
        console.log(`To create the branch manually, use:\n ${checkoutCommand}`);
      }
    }
  });
program.parse(process.argv);
