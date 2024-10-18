#!/bin/bash

NO_CHECKOUT=false
VERSION=false
SHOW_HELP=false

# Extract version from package.json
VERSION_NUMBER=$(grep '"version":' package.json | sed -E 's/[^0-9.]//g')

# Help message
show_help() {
  echo "Usage: git-jira <PROJECT_KEY> <TITLE> [DESCRIPTION] [OPTIONS]"
  echo
  echo "Options:"
  echo "  -x, --no-checkout     Skip branch creation and checkout."
  echo "  -v, --version         Show version information."
  echo "  -h, --help            Show this help message."
  echo
  echo "Environment variables:"
  echo "  JIRA_URL              The Jira base URL."
  echo "  JIRA_EMAIL            Your Jira email."
  echo "  JIRA_PAT              Your Jira Personal Access Token."
}

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    -x|--no-checkout)
      NO_CHECKOUT=true
      shift
      ;;
    -v|--version)
      VERSION=true
      shift
      ;;
    -h|--help)
      SHOW_HELP=true
      shift
      ;;
    *)
      break
      ;;
  esac
done

# If help flag is passed, show help and exit
if [ "$SHOW_HELP" = true ]; then
  show_help
  exit 0
fi

# If version flag is passed, show version and exit
if [ "$VERSION" = true ]; then
  echo "git-jira-fast-ticket version $VERSION_NUMBER"
  exit 0
fi

# Check for required environment variables
if [[ -z "$JIRA_URL" || -z "$JIRA_EMAIL" || -z "$JIRA_PAT" ]]; then
  echo "Please set the JIRA_URL, JIRA_EMAIL, and JIRA_PAT environment variables."
  exit 1
fi

# Check if sufficient arguments are provided
if [[ $# -lt 2 ]]; then
  echo "Usage: git-jira <PROJECT_KEY> <TITLE> [DESCRIPTION] [--no-checkout | -x]"
  exit 1
fi

PROJECT_KEY=$1
TITLE=$2
DESCRIPTION=${3:-$TITLE}

DESCRIPTION_JSON=$(cat <<EOF
{
  "type": "doc",
  "version": 1,
  "content": [
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "$DESCRIPTION"
        }
      ]
    }
  ]
}
EOF
)

TICKET_RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" \
  -u "$JIRA_EMAIL:$JIRA_PAT" \
  -d "{\"fields\": {\"project\": {\"key\": \"$PROJECT_KEY\"}, \"summary\": \"$TITLE\", \"description\": $DESCRIPTION_JSON, \"issuetype\": {\"name\": \"Task\"}}}" \
  "$JIRA_URL/rest/api/3/issue")

TICKET_ID=$(echo "$TICKET_RESPONSE" | jq -r '.key')

if [[ -z "$TICKET_ID" || "$TICKET_ID" == "null" ]]; then
  echo "Error creating Jira ticket: $(echo "$TICKET_RESPONSE" | jq -r '.errors')"
  echo "Full response from Jira: $TICKET_RESPONSE"
  exit 1
fi

TICKET_URL="$JIRA_URL/browse/$TICKET_ID"
echo -e "Jira ticket created: $TICKET_ID - \033[1;34m$TICKET_URL\033[0m"

SANITIZED_TITLE=$(echo "$TITLE" | sed -E 's/[^a-zA-Z0-9]+/-/g; s/^-*|-*$//g')
BRANCH_NAME="${TICKET_ID}-${SANITIZED_TITLE}"

if [ "$NO_CHECKOUT" = false ]; then
  git checkout -b "$BRANCH_NAME"
else
  echo "Branch creation and checkout skipped. You can manually create the branch: git checkout -b \"$BRANCH_NAME\""
fi
