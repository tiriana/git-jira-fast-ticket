import { execSync } from 'child_process';
import { safe } from '@/utils/safe';

export const saveToGitConfig = (key: string, value: string) => safe(() => execSync(`git config --local ${key} "${value}"`));
