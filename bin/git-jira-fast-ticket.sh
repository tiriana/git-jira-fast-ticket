#!/bin/bash

NO_CHECKOUT=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    -x|--no-checkout)
      NO_CHECKOUT=true
      shift
      ;;
    *)
      break
      ;;
  esac
done

if [[ -z "$JIRA_URL" || -z "$JIRA_EMAIL" || -z "$JIRA_PAT" || $# -lt 2 ]]; then
  echo "Please set the JIRA_URL, JIRA_EMAIL, and JIRA_PAT environment variables, and ensure correct usage: git-jira <PROJECT_KEY> <TITLE> [DESCRIPTION] [--no-checkout | -x]"
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
