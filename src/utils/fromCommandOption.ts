import { ConfigSource } from './ConfigSource';

export const fromCommandOption =
  (optionValue: string | undefined): ConfigSource =>
  () =>
    optionValue || null;
