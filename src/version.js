import { readFileSync } from 'node:fs';

const packageUrl = new URL('../package.json', import.meta.url);

export function getVersion() {
  try {
    const { version } = JSON.parse(readFileSync(packageUrl, 'utf8'));
    return typeof version === 'string' ? version : 'unknown';
  } catch {
    return 'unknown';
  }
}
