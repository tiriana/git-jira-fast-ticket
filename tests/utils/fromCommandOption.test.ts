import { fromCommandOption } from '../../src/utils/fromCommandOption';

describe('fromCommandOption', () => {
  it('should return the command option value if provided', () => {
    const source = fromCommandOption('someValue');
    expect(source()).toBe('someValue');
  });

  it('should return null if command option value is undefined', () => {
    const source = fromCommandOption(undefined);
    expect(source()).toBeNull();
  });
});
