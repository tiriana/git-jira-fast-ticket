import { question } from 'readline-sync';
import { saveIfUserAgrees } from '@/utils/saveIfUserAgrees';

export const questionAndSave = (prompt: string, key: string) => {
  const answer = question(prompt);
  if (answer) saveIfUserAgrees(key, answer);
  return answer;
};
