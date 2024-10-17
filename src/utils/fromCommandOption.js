'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.fromCommandOption = void 0;
const fromCommandOption = optionValue => () => optionValue || null;
exports.fromCommandOption = fromCommandOption;
