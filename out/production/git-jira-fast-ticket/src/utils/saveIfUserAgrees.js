import { question } from 'readline-sync';
import { saveToGitConfig } from '@/utils/fromGitConfig';
export const saveIfUserAgrees = (key, value) => {
  const shouldSave = question('Do you want to save this in your local git config? (y/N): ');
  if (shouldSave.toLowerCase() === 'y') {
    saveToGitConfig(key, value);
    console.log(`Saved ${key} to local git config.`);
  }
};
