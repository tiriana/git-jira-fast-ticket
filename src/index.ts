#!/usr/bin/env node

import { Command } from 'commander';
import { fromGitConfig } from './utils/fromGitConfig';
import { question } from 'readline-sync';
import { readFileSync } from 'fs';
import { questionAndSave } from '@/questionAndSave';
import { questionEMailAndSave } from '@/questionEMailAndSave';

const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'));
const program = new Command();

program
  .version(packageJson.version)
  .option('--pat <pat>', 'Jira personal access token')
  .option('-u, --url <url>', 'Jira URL')
  .option('-e, --email <email>', 'User email for Jira')
  .option('-p, --project <project>', 'Jira project ID')
  .arguments('[title] [description]')
  .action(async (title, description) => {
    const opts = program.opts();

    // Check for required options here instead
    const pat = opts.pat || process.env.JIRA_PAT || fromGitConfig('jira.pat') || questionAndSave('Enter Jira personal access token:', 'jira.pat');
    const url = opts.url || process.env.JIRA_URL || fromGitConfig('jira.url') || questionAndSave('Enter Jira URL:', 'jira.url');
    const email = opts.email || process.env.JIRA_EMAIL || fromGitConfig('jira.email') || questionEMailAndSave('Enter Jira email:', 'jira.email');
    const project = opts.project || process.env.JIRA_PROJECT || fromGitConfig('jira.project') || question('Enter Jira project ID:') || '';

    const wasTitleEmpty = !title;
    while (!title) {
      title = question('Enter the title for the Jira ticket:') || '';
    }

    description = wasTitleEmpty ? question('Enter description or leave empty [ENTER]:', { defaultInput: title }) : description || title;

    console.log({ pat, url, email, project, title, description });
  });

program.parse(process.argv);
