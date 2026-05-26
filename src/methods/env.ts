export interface EasEnv {
  apiKey: string;
  apiUrl?: string;
  buildUrl?: string;
  useBeta: boolean;
  metadata: string[];
}

const metadataMappings: Array<[envVar: string, metadataKey: string]> = [
  ['EAS_BUILD_ID', 'eas_build_id'],
  ['EAS_BUILD_PLATFORM', 'eas_platform'],
  ['EAS_BUILD_PROFILE', 'eas_profile'],
  ['EAS_APP_VERSION', 'eas_app_version'],
  ['EAS_GH_SHA', 'gh_sha'],
  ['EAS_GH_BRANCH', 'gh_branch'],
  ['EAS_GH_PR_NUMBER', 'gh_pr_number'],
  ['EAS_GH_PR_URL', 'gh_pr_url'],
  ['EAS_GH_REPO', 'gh_repo'],
  ['EAS_GH_RUN_ID', 'gh_run_id'],
];

export function getEnv(): EasEnv {
  const apiKey = process.env.DEVICE_CLOUD_API_KEY;
  if (!apiKey) {
    throw new Error(
      'DEVICE_CLOUD_API_KEY is not set. Pass it via the step `env:` block: ' +
        'DEVICE_CLOUD_API_KEY: ${{ secrets.DEVICE_CLOUD_API_KEY }}'
    );
  }

  const metadata: string[] = [];
  for (const [envVar, key] of metadataMappings) {
    const value = process.env[envVar];
    if (value) {
      metadata.push(`${key}=${value}`);
    }
  }

  return {
    apiKey,
    apiUrl: process.env.DEVICE_CLOUD_API_URL || undefined,
    buildUrl: process.env.EAS_BUILD_URL || undefined,
    useBeta: process.env.DCD_USE_BETA === 'true',
    metadata,
  };
}
