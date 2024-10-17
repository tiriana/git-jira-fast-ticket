import { ConfigSource } from './ConfigSource';

export const fromEnvVar =
  (envVarName: string): ConfigSource =>
  () =>
    process.env[envVarName] || null;
