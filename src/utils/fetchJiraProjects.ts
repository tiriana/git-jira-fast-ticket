import { Version3Client } from 'jira.js';
import ora from 'ora';

export const fetchJiraProjects = async (url: string, pat: string, email: string) => {
  const client = new Version3Client({
    host: url,
    authentication: {
      basic: {
        email: email,
        apiToken: pat,
      },
    },
  });

  const spinner = ora('Fetching Jira projects...').start();

  try {
    const { values: projects } = await client.projects.searchProjects();
    spinner.succeed('Jira projects fetched successfully.');
    return projects;
  } catch (error) {
    spinner.fail('Failed to fetch projects from Jira.');
    console.error(error instanceof Error ? error.message : error);
    return [];
  }
};
