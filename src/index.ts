#!/usr/bin/env node

import { Command } from 'commander';
const program = new Command();

program
    .version('1.0.0')
    .requiredOption('--pat <pat>', 'Jira personal access token')
    .option('-u, --url <url>', 'Jira URL')
    .option('-e, --email <email>', 'User email for Jira')
    .option('-p, --project <project>', 'Jira project ID')
    .arguments('<title> [description]')
    .action((title: string, description: string | undefined) => {
        const options = program.opts();

        console.log('Received options:');
        console.log(`PAT: ${options.pat}`);
        console.log(`URL: ${options.url}`);
        console.log(`Email: ${options.email}`);
        console.log(`Project: ${options.project}`);

        console.log('\nReceived arguments:');
        console.log(`Title: ${title}`);
        console.log(`Description: ${description || 'No description provided'}`);
    });

program.parse(process.argv);
