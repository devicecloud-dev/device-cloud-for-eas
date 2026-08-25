export interface EasEnv {
  apiKey: string;
  apiUrl?: string;
  buildUrl?: string;
  useBeta: boolean;
  metadata: string[];
}

// IMPORTANT: env var names must NOT use the `EAS_BUILD_*` prefix.
// EAS Build workers reserve that namespace for system env vars
// (EAS_BUILD_ID, EAS_BUILD_PROJECT_ID, EAS_BUILD_WORKINGDIR, ...).
// Collisions overwrite the worker's own job-run ID and break the
// project-archive refresh, killing the run silently after PREPARE_PROJECT.
const metadataMappings: Array<[envVar: string, metadataKey: string]> = [
  ['DCD_EAS_BUILD_ID', 'eas_build_id'],
  ['DCD_EAS_PLATFORM', 'eas_platform'],
  ['DCD_EAS_PROFILE', 'eas_profile'],
  ['DCD_EAS_APP_VERSION', 'eas_app_version'],
  ['DCD_GH_SHA', 'gh_sha'],
  ['DCD_GH_BRANCH', 'gh_branch'],
  ['DCD_GH_PR_NUMBER', 'gh_pr_number'],
  ['DCD_GH_PR_URL', 'gh_pr_url'],
  ['DCD_GH_REPO', 'gh_repo'],
  ['DCD_GH_RUN_ID', 'gh_run_id'],
  // Names the GitHub check this run posts ("DeviceCloud / iOS"). Set it per job
  // when a commit is tested more than once — GitHub matches required checks by
  // name, so runs sharing a name share one branch-protection gate, and it
  // follows whichever finished last. Keep the value fixed for a given job.
  ['DCD_CHECK_NAME', 'gh_check_name'],
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
    buildUrl: process.env.DCD_EAS_BUILD_URL || undefined,
    useBeta: process.env.DCD_USE_BETA === 'true',
    metadata,
  };
}
