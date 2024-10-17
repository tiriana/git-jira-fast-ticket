import { question } from 'readline-sync';

export const promptForInput = (message: string): string | null => {
  const response = question(message);
  return response || null;
};
