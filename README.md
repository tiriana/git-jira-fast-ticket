# Git-Jira-Fast-Ticket

## **Fast Jira ticket creation, straight from your terminal.**

**Git-Jira-Fast-Ticket allows developers to create Jira tickets directly from their git environment with a single command. It eliminates the need to manually navigate Jira, letting you focus on coding by automating ticket creation and branch setup.**

## Motivation

**Git-Jira-Fast-Ticket** is designed to make creating JIRA tickets fast and easy. Instead of manually opening Jira and filling out forms, you can create tickets and corresponding branches directly from your terminal, perfect for quick tasks, cleanups, or refactors.

## Installation

```bash
npm install -g git-jira-fast-ticket
```

## Usage

```bash
git jira-fast-ticket [options] <title> [description]
```

### Options

- `--pat <pat>`: Jira Personal Access Token (PAT)
- `-u, --url <url>`: Jira URL
- `-e, --email <email>`: User email for Jira
- `-p, --project <project>`: Jira Project ID
- `-x, --no-checkout`: Do not checkout to the new branch automatically

### Examples

1. **Using short for project**:

   ```bash
   git jira-fast-ticket -p XYZ "Fix authentication bug"
   ```

2. **With all options**:
   ```bash
   git jira-fast-ticket --pat your-pat --url https://jira.example.com --email your-email@example.com --project XYZ "New Feature" "Implement new login system"
   ```

By default, the tool checks out to the new branch. If `--no-checkout` is used, the command for creating the branch will be displayed for manual checkout.

## Configuration Tips

You can save Jira credentials like PAT, URL, email, and project in git config or environment variables for ease of use:

- Jira PAT: `JIRA_PAT` or `git config jira.pat`
- Jira URL: `JIRA_URL` or `git config jira.url`
- Jira Email: `JIRA_EMAIL` or `git config jira.email`
- Jira Project: `JIRA_PROJECT` or `git config jira.project` (though you should avoid this if you use multiple Jira projects in the same repository).

This tool simplifies Jira ticket creation while letting you focus more on coding than on process overhead.
