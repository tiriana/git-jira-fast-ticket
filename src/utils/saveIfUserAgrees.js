'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.saveIfUserAgrees = void 0;
const readline_sync_1 = require('readline-sync');
const fromGitConfig_1 = require('@/utils/fromGitConfig');
const saveIfUserAgrees = (key, value) => {
  const shouldSave = (0, readline_sync_1.question)('Do you want to save this in your local git config? (y/N): ');
  if (shouldSave.toLowerCase() === 'y') {
    (0, fromGitConfig_1.saveToGitConfig)(key, value);
    console.log(`Saved ${key} to local git config.`);
  }
};
exports.saveIfUserAgrees = saveIfUserAgrees;
