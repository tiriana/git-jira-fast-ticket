#!/usr/bin/env node

const { Command } = require('commander');
const inquirer = require('inquirer');
const { execSync } = require('child_process');
const program = new Command();

// Utility functions to retrieve configurations with fallback options
const getConfig = (key, envVar, defaultValue) => {
    try {
        return execSync(`git config --get ${key}`).toString().trim();
    } catch (error) {
        return process.env[envVar] || defaultValue;
    }
};

// Fallback prompts for missing config
const promptForInput = async (message) => {
    const answers = await inquirer.prompt([{ name: 'input', message }]);
    return answers.input;
};

program
    .version('1.0.0')
    .description('Quickly create Jira tickets from the command line')
    .requiredOption('-p, --project <project>', 'Jira project ID', getConfig('jira_project', 'JIRA_PROJECT'))
    .option('-u, --url <url>', 'Jira URL', getConfig('jira_url', 'JIRA_URL'))
    .option('-e, --email <email>', 'User email for Jira', getConfig('jira_email', 'JIRA_EMAIL') || getConfig('user.email'))
    .option('--pat <pat>', 'Jira personal access token', getConfig('jira_pat', 'JIRA_PAT'))
    .option('-x, --no-checkout', 'Do not switch to the new branch')
    .arguments('<title> [description]')
    .action(async (title, description) => {
        const jiraUrl = program.url || await promptForInput('Enter Jira URL:');
        const email = program.email || await promptForInput('Enter your email:');
        const pat = program.pat || await promptForInput('Enter your Jira PAT:');
        const project = program.project || await promptForInput('Enter Jira project ID:');

        if (!pat) {
            console.log('\nYou need a Jira PAT. Use the following command to set it globally:');
            console.log('  git config --global jira_pat <YOUR_PAT>');
            return;
        }

        if (!project) {
            console.log('\nSet the Jira project locally with:');
            console.log('  git config jira_project <YOUR_PROJECT_ID>');
            return;
        }

        const sanitizedTitle = title.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        const branchName = `${project}-${sanitizedTitle}`;

        // Construct description JSON for Jira
        const descriptionJson = JSON.stringify({
            type: "doc",
            version: 1,
            content: [
                {
                    type: "paragraph",
                    content: [{ type: "text", text: description || title }]
                }
            ]
        });

        // Make the Jira API call to create the ticket
        const createTicketCommand = `curl -s -X POST -H "Content-Type: application/json" -u "${email}:${pat}" -d '{"fields": {"project": {"key": "${project}"}, "summary": "${title}", "description": ${descriptionJson}, "issuetype": {"name": "Task"}}}' "${jiraUrl}/rest/api/3/issue"`;

        try {
            const ticketResponse = execSync(createTicketCommand).toString();
            const ticketId = JSON.parse(ticketResponse).key;
            const ticketUrl = `${jiraUrl}/browse/${ticketId}`;

            console.log(`Jira ticket created: ${ticketId} - ${ticketUrl}`);

            if (program.checkout) {
                execSync(`git checkout -b ${branchName}`);
            } else {
                console.log(`Use this command to switch to the new branch: git checkout -b ${branchName}`);
            }
        } catch (error) {
            console.error('Error creating Jira ticket:', error.message);
        }
    });

program.parse(process.argv);
