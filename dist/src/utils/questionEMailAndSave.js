import { questionEMail } from 'readline-sync';
import { saveIfUserAgrees } from '@/utils/saveIfUserAgrees';
export const questionEMailAndSave = (prompt, key) => {
    const answer = questionEMail(prompt);
    if (answer)
        saveIfUserAgrees(key, answer);
    return answer;
};
