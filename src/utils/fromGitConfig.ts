import { execSync } from 'child_process';
import { safe } from '@/utils/safe';

export const fromGitConfig = (key: string) => safe(() => execSync(`git config --get ${key}`, { encoding: 'utf-8' }).trim());
