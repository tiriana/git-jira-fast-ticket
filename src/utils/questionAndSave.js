'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.questionAndSave = void 0;
const readline_sync_1 = require('readline-sync');
const saveIfUserAgrees_1 = require('@/saveIfUserAgrees');
const questionAndSave = (prompt, key) => {
  const answer = (0, readline_sync_1.question)(prompt);
  if (answer) (0, saveIfUserAgrees_1.saveIfUserAgrees)(key, answer);
  return answer;
};
exports.questionAndSave = questionAndSave;
