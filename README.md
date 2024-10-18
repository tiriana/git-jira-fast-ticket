# git-jira-fast-ticket

`git-jira-fast-ticket` is a CLI tool that allows you to create Jira tickets and automatically switch to a new branch
named after the created ticket.

## Installation

To install this tool globally via npm, run the following command:

```bash
npm install -g git-jira-fast-ticket.sh
```

## Usage

Before using the command, ensure the following environment variables are set:

- `JIRA_URL`: The base URL for your Jira instance.
- `JIRA_EMAIL`: Your Jira account email.
- `JIRA_PAT`: Your Jira personal access token (PAT).

### Command:

```bash
git-jira-fast-ticket.sh PROJECT_KEY "Title" "Description"
```

- `PROJECT_KEY`: The Jira project key.
- `Title`: The summary/title of the ticket.
- `Description`: (Optional) The description of the ticket; defaults to the title if not provided.

This command will:

1. Create a new Jira task in the specified project.
2. Automatically create and checkout a new Git branch named after the created ticket.
