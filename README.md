# git-jira-fast-ticket

[![CI](https://github.com/tiriana/git-jira-fast-ticket/actions/workflows/ci.yml/badge.svg)](https://github.com/tiriana/git-jira-fast-ticket/actions/workflows/ci.yml)
[![CI and Release](https://github.com/tiriana/git-jira-fast-ticket/actions/workflows/release.yml/badge.svg)](https://github.com/tiriana/git-jira-fast-ticket/actions/workflows/release.yml)

Create a Jira ticket from the command line and switch to a Git branch named after it.

```console
$ git jira-fast-ticket PAY "Fix the checkout redirect"
Jira ticket created: PAY-412 - https://your-domain.atlassian.net/browse/PAY-412
Switched to a new branch 'PAY-412-Fix-the-checkout-redirect'
```

## Quickstart

Needs Node.js 18 or newer and Git 2.x, and nothing else — no Bash, `curl` or `jq`.

```bash
npm install -g git-jira-fast-ticket

git jira-fast-ticket setup                           # once: asks for URL, email and an API token

git jira-fast-ticket PAY "Fix the checkout redirect" # from inside any Git repository
```

`git jira-fast-ticket -h` shows what is configured and where each value came from.

To see the whole flow before you have a token, add `--dry-run`: it prints the request it would send and creates the branch, without contacting Jira.

## API token

Create one at <https://id.atlassian.com/manage-profile/security/api-tokens> (Atlassian profile → **Security** → **API tokens**) and paste it into the wizard; it is read without echoing and never printed. Use the email you sign in to Jira with, and your site root as the URL, for example `https://your-domain.atlassian.net`.

## Configuration

Settings live in Git config under the `jira-fast-ticket` section, so there is no file to create and both scopes come for free. Per setting, the first match wins: environment variable, repository-local config, global config, then the default.

| Setting | Environment variable | Default |
| --- | --- | --- |
| `jira-fast-ticket.url` | `JIRA_URL` | — |
| `jira-fast-ticket.email` | `JIRA_EMAIL` | — |
| `jira-fast-ticket.token` | `JIRA_PAT` | — |
| `jira-fast-ticket.issueType` | `JIRA_ISSUE_TYPE` | `Task` |

The wizard writes the URL and email globally and asks where the token goes: **this repository** (the default) writes `.git/config`, which cannot be committed, while **all repositories** writes the shared config, which is also the file people paste into public dotfiles repositories.

```bash
git config --global jira-fast-ticket.url https://your-domain.atlassian.net
git config --local  jira-fast-ticket.token <api-token>
```

## Usage

```bash
git jira-fast-ticket <PROJECT_KEY> <TITLE> [DESCRIPTION] [OPTIONS]
```

`DESCRIPTION` is optional and defaults to the title.

| Option | Effect |
| --- | --- |
| `-x`, `--no-checkout` | Create the ticket but do not create or switch branches |
| `-n`, `--dry-run` | Print the request that would be sent and create the branch, without contacting Jira |
| `--configure` | Run the setup wizard, as `setup` does |
| `-v`, `--version` | Print the version |
| `-h`, `--help` | Print help and the configuration status |
| `--` | Treat everything after it as positional arguments |

The branch is `<KEY>-<title>`, with every run of characters outside `A-Za-z0-9` collapsed to a single dash and leading or trailing dashes removed.

One exception to the subcommand form: write help as `git jira-fast-ticket -h`, or `git-jira-fast-ticket --help`. Git intercepts `--help` on a subcommand and opens a man page instead of running the tool.

## Troubleshooting

| Message | Fix |
| --- | --- |
| `Missing required configuration: ...` | Run `git jira-fast-ticket setup` |
| `401` / `403` | The email or token is wrong or expired; check `JIRA_EMAIL` and `JIRA_PAT` |
| `404` | The `JIRA_URL` is wrong, or the project key does not exist |
| `400`, or an error naming `issuetype` | The project does not offer that work item type; set `jira-fast-ticket.issueType` |
| `429`, `5xx`, a network error | Transient; retry shortly |

## Development

```bash
git clone https://github.com/tiriana/git-jira-fast-ticket.git
cd git-jira-fast-ticket && npm ci && npm test
```

The suite uses the built-in `node:test` runner and needs no network access or real credentials: the end-to-end tests run the real entry point in temporary repositories against a local Jira stub.
