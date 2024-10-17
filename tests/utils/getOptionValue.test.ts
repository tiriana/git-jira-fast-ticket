import { getOptionValue } from '../../src/utils/getOptionValue';
import { ConfigSource } from '../../src/utils/ConfigSource';

describe('getOptionValue', () => {
  it('returns the first non-null value from synchronous sources', async () => {
    const sources: ConfigSource[] = [() => null, () => 'value1', () => 'value2'];
    const result = await getOptionValue(sources);
    expect(result).toBe('value1');
  });

  it('returns the first non-null value from asynchronous sources', async () => {
    const sources: ConfigSource[] = [async () => null, async () => 'asyncValue1', async () => 'asyncValue2'];
    const result = await getOptionValue(sources);
    expect(result).toBe('asyncValue1');
  });

  it('returns the first value regardless of other sources', async () => {
    const sources: ConfigSource[] = [() => null, async () => null, () => 'syncValue', async () => 'asyncValue'];
    const result = await getOptionValue(sources);
    expect(result).toBe('syncValue');
  });

  it('returns null if all sources are null', async () => {
    const sources: ConfigSource[] = [() => null, async () => null, () => null];
    const result = await getOptionValue(sources);
    expect(result).toBeNull();
  });
});
