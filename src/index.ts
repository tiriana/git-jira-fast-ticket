#!/usr/bin/env node

import { Command } from 'commander';
import { promptForInput } from './utils/promptForInput';
import { fromGitConfig } from './utils/fromGitConfig';

const program = new Command();

program
  .version('1.0.0')
  .requiredOption('--pat <pat>', 'Jira personal access token', process.env.JIRA_PAT)
  .option('-u, --url <url>', 'Jira URL', process.env.JIRA_URL)
  .option('-e, --email <email>', 'User email for Jira', process.env.JIRA_EMAIL)
  .option('-p, --project <project>', 'Jira project ID', process.env.JIRA_PROJECT)
  .arguments('<title> [description]')
  .action(async (title: string, description: string) => {
    const opts = program.opts();

    // Handle async fallbacks
    const pat = opts.pat || (await fromGitConfig('jira.pat')) || (await promptForInput('Enter your Jira PAT:'));
    const url = opts.url || (await fromGitConfig('jira.url')) || (await promptForInput('Enter your Jira URL:'));
    const email =
      opts.email || (await fromGitConfig('jira.email')) || (await fromGitConfig('user.email')) || (await promptForInput('Enter your email for Jira:'));
    const project = opts.project || (await fromGitConfig('jira.project')) || (await promptForInput('Enter the Jira project ID:'));

    if (!title) {
      console.error('Error: Title is required.');
      process.exit(1);
    }

    description = description || title;

    // Further logic to create Jira ticket using `pat`, `url`, `email`, `project`, `title`, `description`
    console.log(`Creating Jira ticket with:\nPAT: ${pat}\nURL: ${url}\nEmail: ${email}\nProject: ${project}\nTitle: ${title}\nDescription: ${description}`);
  });

program.parse(process.argv);
