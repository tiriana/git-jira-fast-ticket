import { questionEMail } from 'readline-sync';
import { saveIfUserAgrees } from '@/saveIfUserAgrees';

export const questionEMailAndSave = (prompt: string, key: string) => {
  const answer = questionEMail(prompt);
  if (answer) saveIfUserAgrees(key, answer);
  return answer;
};
