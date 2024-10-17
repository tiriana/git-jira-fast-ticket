import { ConfigSource } from './ConfigSource';

export const getOptionValue = async (sources: ConfigSource[]): Promise<string | null> => {
  for (const source of sources) {
    const value = await source();
    if (value) {
      return value;
    }
  }
  return null;
};
