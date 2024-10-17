'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.safe = void 0;
const safe = fn => {
  try {
    return fn();
  } catch (_a) {
    return null;
  }
};
exports.safe = safe;
