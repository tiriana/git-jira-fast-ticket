// Function to prompt user interactively if no other value is found
import inquirer from 'inquirer';

import { ConfigSource } from './ConfigSource';

export const promptForInput =
  (message: string): ConfigSource =>
  async () => {
    const response = await inquirer.prompt({
      type: 'input',
      name: 'value',
      message,
    });
    return response.value || null;
  };
