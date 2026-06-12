import { afterEach, describe, expect, it, vi } from 'vitest';

import { getEnv } from './env';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getEnv', () => {
  it('throws a helpful error when DEVICE_CLOUD_API_KEY is missing', () => {
    vi.stubEnv('DEVICE_CLOUD_API_KEY', '');
    expect(() => getEnv()).toThrow(/DEVICE_CLOUD_API_KEY is not set/);
  });

  it('returns the api key and an empty metadata list when no DCD_* vars are set', () => {
    vi.stubEnv('DEVICE_CLOUD_API_KEY', 'secret-key');
    const env = getEnv();
    expect(env.apiKey).toBe('secret-key');
    expect(env.metadata).toEqual([]);
    expect(env.apiUrl).toBeUndefined();
    expect(env.buildUrl).toBeUndefined();
    expect(env.useBeta).toBe(false);
  });

  it('maps DCD_EAS_* and DCD_GH_* vars to prefixed metadata pairs', () => {
    vi.stubEnv('DEVICE_CLOUD_API_KEY', 'k');
    vi.stubEnv('DCD_EAS_BUILD_ID', 'build-123');
    vi.stubEnv('DCD_EAS_PLATFORM', 'android');
    vi.stubEnv('DCD_GH_SHA', 'deadbeef');
    vi.stubEnv('DCD_GH_BRANCH', 'main');

    const { metadata } = getEnv();

    expect(metadata).toContain('eas_build_id=build-123');
    expect(metadata).toContain('eas_platform=android');
    expect(metadata).toContain('gh_sha=deadbeef');
    expect(metadata).toContain('gh_branch=main');
  });

  it('skips metadata entries whose source env var is unset or empty', () => {
    vi.stubEnv('DEVICE_CLOUD_API_KEY', 'k');
    vi.stubEnv('DCD_EAS_BUILD_ID', 'build-123');
    vi.stubEnv('DCD_EAS_PROFILE', ''); // empty -> skipped
    // DCD_GH_SHA intentionally left unset -> skipped

    const { metadata } = getEnv();

    expect(metadata).toEqual(['eas_build_id=build-123']);
    expect(metadata.some((m) => m.startsWith('eas_profile='))).toBe(false);
    expect(metadata.some((m) => m.startsWith('gh_sha='))).toBe(false);
  });

  it('reads apiUrl, buildUrl and useBeta from their env vars', () => {
    vi.stubEnv('DEVICE_CLOUD_API_KEY', 'k');
    vi.stubEnv('DEVICE_CLOUD_API_URL', 'https://api.dev.devicecloud.dev');
    vi.stubEnv('DCD_EAS_BUILD_URL', 'https://expo.dev/build/xyz');
    vi.stubEnv('DCD_USE_BETA', 'true');

    const env = getEnv();

    expect(env.apiUrl).toBe('https://api.dev.devicecloud.dev');
    expect(env.buildUrl).toBe('https://expo.dev/build/xyz');
    expect(env.useBeta).toBe(true);
  });

  it('treats any DCD_USE_BETA value other than "true" as false', () => {
    vi.stubEnv('DEVICE_CLOUD_API_KEY', 'k');
    vi.stubEnv('DCD_USE_BETA', '1');
    expect(getEnv().useBeta).toBe(false);
  });
});
