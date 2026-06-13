import type { AppEnv } from '@cdv/types';

// Platform-agnostic env access
// Web: uses process.env / NEXT_PUBLIC_*
// Mobile: uses expo-constants or similar

export function getAppEnv(): AppEnv {
  const env = (
    typeof process !== 'undefined'
      ? process.env.NEXT_PUBLIC_APP_ENV
      : undefined
  ) as AppEnv | undefined;
  return env ?? 'dev';
}

export const IS_DEV = getAppEnv() === 'dev';
export const IS_BETA = getAppEnv() === 'beta';
export const IS_PROD = getAppEnv() === 'prod';
