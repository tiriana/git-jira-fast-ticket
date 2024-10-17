'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.promptForInput = void 0;
const readline_sync_1 = require('readline-sync');
const promptForInput = message => {
  const response = (0, readline_sync_1.question)(message);
  return response || null;
};
exports.promptForInput = promptForInput;
