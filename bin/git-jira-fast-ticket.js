#!/usr/bin/env node

const shell = require('shelljs');
const path = require('path');

// Resolve the path to the Bash script
const bashScriptPath = path.resolve(__dirname, './git-jira-fast-ticket.sh');

// Check if Bash is available in the environment
if (!shell.which('bash')) {
  shell.echo('Error: Bash is required to run this script.');
  shell.exit(1);
}

// Execute the Bash script file directly
const result = shell.exec(`bash ${bashScriptPath} ${process.argv.slice(2).join(' ')}`);

// Check for errors in the Bash script execution
if (result.code !== 0) {
  shell.echo('Error: Script execution failed');
  shell.exit(1);
}
