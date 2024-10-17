import { fromEnvVar } from '../../src/utils/fromEnvVar';

describe('fromEnvVar', () => {
  beforeAll(() => {
    process.env.TEST_ENV_VAR = 'envValue';
  });

  afterAll(() => {
    delete process.env.TEST_ENV_VAR;
  });

  it('should return the environment variable value if set', () => {
    const source = fromEnvVar('TEST_ENV_VAR');
    expect(source()).toBe('envValue');
  });

  it('should return null if the environment variable is not set', () => {
    const source = fromEnvVar('NON_EXISTENT_VAR');
    expect(source()).toBeNull();
  });
});
