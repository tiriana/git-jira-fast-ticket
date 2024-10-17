'use strict';
var __awaiter =
  (this && this.__awaiter) ||
  function (thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P
        ? value
        : new P(function (resolve) {
            resolve(value);
          });
    }
    return new (P || (P = Promise))(function (resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator['throw'](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.createJiraTicket = createJiraTicket;
const ora_1 = require('ora');
function createJiraTicket(jiraClient, project, title, description) {
  return __awaiter(this, void 0, void 0, function* () {
    const spinner = (0, ora_1.default)('Creating Jira ticket...').start();
    try {
      const issue = yield jiraClient.issues.createIssue({
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
  });
}
