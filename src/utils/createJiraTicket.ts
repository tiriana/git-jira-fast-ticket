import ora from 'ora';
import { Version3Client } from 'jira.js';

export async function createJiraTicket(jiraClient: Version3Client, project: string, title: string, description: string) {
  const spinner = ora('Creating Jira ticket...').start();

  try {
    const issue = await jiraClient.issues.createIssue({
      fields: {
        summary: title,
        issuetype: { name: 'Task' },
        project: { key: project },
        description: description,
      },
    });

    const issueUrl = new URL(issue.self);
    issueUrl.pathname = `/browse/${issue.key}`;

    spinner.succeed(`Ticket created successfully: ${issue.key} - ${issueUrl}`);
    return issue;
  } catch (error) {
    spinner.fail('Failed to create Jira ticket.');
    if (error instanceof Error) {
      console.error(error.message);
    }
    return null;
  }
}
