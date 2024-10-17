import { promptForInput } from '../../src/utils/promptForInput';
import inquirer from 'inquirer';

jest.mock('inquirer');
const mockedInquirer = jest.mocked(inquirer);

describe('promptForInput', () => {
  it('should return the user input when prompted', async () => {
    mockedInquirer.prompt.mockResolvedValueOnce({ value: 'userInput' });

    const source = promptForInput('Enter a value:');
    const result = await source();

    expect(result).toBe('userInput');
    expect(mockedInquirer.prompt).toHaveBeenCalledWith({
      type: 'input',
      name: 'value',
      message: 'Enter a value:',
    });
  });

  it('should return null if the user input is empty', async () => {
    mockedInquirer.prompt.mockResolvedValueOnce({ value: '' });

    const source = promptForInput('Enter a value:');
    const result = await source();

    expect(result).toBeNull();
  });
});
