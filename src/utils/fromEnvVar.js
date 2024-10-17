'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.fromEnvVar = void 0;
const fromEnvVar = envVarName => () => process.env[envVarName] || null;
exports.fromEnvVar = fromEnvVar;
