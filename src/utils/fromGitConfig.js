'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.saveToGitConfig = exports.fromGitConfig = void 0;
const child_process_1 = require('child_process');
const safe_1 = require('@/utils/safe');
const fromGitConfig = key => (0, safe_1.safe)(() => (0, child_process_1.execSync)(`git config --get ${key}`, { encoding: 'utf-8' }).trim());
exports.fromGitConfig = fromGitConfig;
const saveToGitConfig = (key, value) => (0, child_process_1.execSync)(`git config --local ${key} "${value}"`);
exports.saveToGitConfig = saveToGitConfig;
