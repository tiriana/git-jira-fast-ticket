#!/usr/bin/env bats

load 'test_helper/bats-support/load'
load 'test_helper/bats-assert/load'

setup() {
  export JIRA_URL="http://localhost:8000"
  export JIRA_EMAIL="test@example.com"
  export JIRA_PAT="dummy-pat"
}

@test "should fail when environment variables are missing" {
  unset JIRA_URL
  unset JIRA_EMAIL
  unset JIRA_PAT
  run ./bin/git-jira-fast-ticket.sh "PROJECT_KEY" "Test Title"
  [ "$status" -eq 1 ]
  assert_output --partial "Please set the JIRA_URL, JIRA_EMAIL, and JIRA_PAT environment variables"
}

@test "should create a ticket and return the correct branch name" {
  run ./bin/git-jira-fast-ticket.sh "TEST" "Test Title" "Test Description"
  echo "Output: $output"  # Debug output for test
  echo "Status: $status"   # Debug output for status
  [ "$status" -eq 0 ]
  assert_output --partial "Jira ticket created: TEST-123"
  git checkout main
  git branch -D TEST-123-Test-Title
}
