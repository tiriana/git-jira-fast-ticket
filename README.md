# git-jira-fast-ticket

[![CI](https://github.com/tiriana/git-jira-fast-ticket/actions/workflows/ci.yml/badge.svg)](https://github.com/tiriana/git-jira-fast-ticket/actions/workflows/ci.yml)
[![CI and Release](https://github.com/tiriana/git-jira-fast-ticket/actions/workflows/release.yml/badge.svg)](https://github.com/tiriana/git-jira-fast-ticket/actions/workflows/release.yml)

Create a Jira work item and immediately switch to a Git branch named after it.

```console
$ git-jira-fast-ticket PAY "Fix the checkout redirect"
Jira ticket created: PAY-412 - https://your-domain.atlassian.net/browse/PAY-412
Switched to a new branch 'PAY-412-Fix-the-checkout-redirect'
```

## Quickstart

1. Install it:

   ```bash
   npm install -g git-jira-fast-ticket
   ```

2. Configure it once. The wizard asks for your Jira URL, your email and an API token, and where to keep the token:

   ```bash
   git-jira-fast-ticket setup
   ```

3. Create a ticket from inside any Git repository:

   ```bash
   git-jira-fast-ticket PAY "Fix the checkout redirect"
   ```

Run `git-jira-fast-ticket --help` at any time to see what is configured and where each value came from.

## Requirements

1. **Node.js 18 or newer.** Node is the only runtime this tool needs; there is no Bash, `curl` or `jq` involvement.
2. **Git 2.x.** The tool creates the ticket and then creates the branch.

## Creating a Jira API token

1. Open <https://id.atlassian.com/manage-profile/security/api-tokens> (Atlassian profile → **Security** → **API tokens**).
2. Choose **Create API token**, give it a name, and copy the value.
3. Paste it when the setup wizard asks for the Personal Access Token. It is read without echoing and never printed.

The email must be the address you sign in to Jira with; the URL is your site root, for example `https://your-domain.atlassian.net`.

## Configuration

Settings live in **Git config**, under the `jira-fast-ticket` section. That means there is no config file to create, and both scopes come for free: `git config --global` applies everywhere, `git config --local` applies to one repository and takes precedence.

| Setting | Environment variable | Default | Purpose |
| --- | --- | --- | --- |
| `jira-fast-ticket.url` | `JIRA_URL` | — | Jira site root, for example `https://your-domain.atlassian.net` |
| `jira-fast-ticket.email` | `JIRA_EMAIL` | — | The email you sign in to Jira with |
| `jira-fast-ticket.token` | `JIRA_PAT` | — | A Jira API token |
| `jira-fast-ticket.issueType` | `JIRA_ISSUE_TYPE` | `Task` | Work item type to create |

Values are resolved per setting, first match wins:

1. A non-empty environment variable.
2. The repository-local Git config.
3. The global Git config.
4. The default, where the setting has one.

To set them by hand:

```bash
git config --global jira-fast-ticket.url https://your-domain.atlassian.net
git config --global jira-fast-ticket.email you@example.com
git config --local  jira-fast-ticket.token <your-api-token>
```

The wizard writes the URL and email globally. It asks where the token should go:

1. **This repository** (the default) writes it to `.git/config`, which cannot be committed, so the token cannot leak into the repository.
2. **All repositories** writes it to the shared Git config, which is convenient but also the file people paste into public dotfiles repositories.

A repository-scoped token also lets you point the URL at a second Jira site in one repository without affecting the others.

## Usage

```bash
git-jira-fast-ticket <PROJECT_KEY> <TITLE> [DESCRIPTION] [OPTIONS]
```

Because Git resolves `git-<name>` from `PATH`, the subcommand form works as well:

```bash
git jira-fast-ticket PAY "Fix the checkout redirect"
```

1. `PROJECT_KEY`: the Jira project key, for example `PAY`.
2. `TITLE`: the work item summary.
3. `DESCRIPTION`: optional; a plain-text description. Defaults to the title.

Options:

| Option | Effect |
| --- | --- |
| `-x`, `--no-checkout` | Create the ticket but only print the branch command; do not create or switch branches |
| `--configure` | Run the setup wizard, same as `git-jira-fast-ticket setup` |
| `-v`, `--version` | Print the version |
| `-h`, `--help` | Print help and the configuration status |
| `--` | Treat everything after it as positional arguments |

The created work item is printed, and the branch is created and checked out. The branch name is `<KEY>-<title>` with every run of characters outside `A-Za-z0-9` collapsed to a single dash and any leading or trailing dash removed, so `Fix the checkout redirect` becomes `PAY-412-Fix-the-checkout-redirect`.

## Troubleshooting

The tool prints the reason Jira gave, plus a hint that names the setting to check.

| Message | Fix |
| --- | --- |
| `Missing required configuration: JIRA_URL, ...` | Run `git-jira-fast-ticket setup`, or set the missing keys as shown in the message |
| `401` / `403` | The email or token is wrong or expired. Check `JIRA_EMAIL` and `JIRA_PAT`, or create a new API token |
| `404` | `JIRA_URL` is wrong, or the project key does not exist |
| `400`, or an error naming `issuetype` | The project does not use the configured work item type. Set it: `git config --global jira-fast-ticket.issueType Story` |
| `429` | Jira is rate limiting. Retry in a moment |
| `5xx` | A Jira-side error. Retry shortly |
| A network error | Check that `JIRA_URL` is reachable and that the machine is online |

## Development

```bash
git clone https://github.com/tiriana/git-jira-fast-ticket.git
cd git-jira-fast-ticket
npm ci
npm test
```

The suite uses the built-in `node:test` runner and needs no network access or real credentials: the end-to-end tests run the real entry point inside temporary repositories against a local Jira stub.
