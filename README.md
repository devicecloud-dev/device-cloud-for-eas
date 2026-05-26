# Device Cloud for EAS Workflows

Run [Maestro](https://maestro.mobile.dev) flows on [devicecloud.dev](https://devicecloud.dev) from [EAS Workflows](https://docs.expo.dev/eas/workflows/get-started/). A drop-in for Expo's `maestro-cloud` job that targets Device Cloud instead.

## Quick start

```yaml
jobs:
  build_android:
    type: build
    params:
      platform: android
      profile: preview

  e2e:
    after: [build_android]
    runs_on: linux-medium
    outputs:
      console_url: ${{ steps.dcd.outputs.console_url }}
      status: ${{ steps.dcd.outputs.upload_status }}
    steps:
      - uses: eas/checkout
      - id: dcd
        run: npx --yes @devicecloud.dev/eas-workflow@v0 --flows ./.maestro --android-device pixel-7
        env:
          DEVICE_CLOUD_API_KEY: ${{ secrets.DEVICE_CLOUD_API_KEY }}
          EAS_BUILD_URL: ${{ after.build_android.outputs.build_url }}
          EAS_GH_SHA: ${{ github.sha }}
```

Full Android and iOS examples are in [`examples/`](./examples/).

## Inputs

The wrapper takes its config from two places: **environment variables** (for context that's the same across runs) and **CLI flags** (for per-flow options). Anything you pass on the command line is forwarded as-is to `dcd cloud`.

### Environment variables

| Var | Required | Source in YAML | Purpose |
|---|---|---|---|
| `DEVICE_CLOUD_API_KEY` | ✅ | `${{ secrets.DEVICE_CLOUD_API_KEY }}` | Device Cloud API key |
| `EAS_BUILD_URL` | when no `--app-binary-id`/`--app-file` | `${{ after.<job>.outputs.build_url }}` | Signed URL to the EAS build artifact |
| `EAS_BUILD_ID` | optional | `${{ after.<job>.outputs.build_id }}` | Tagged as `eas_build_id` metadata |
| `EAS_BUILD_PLATFORM` | optional | `${{ after.<job>.outputs.platform }}` | Tagged as `eas_platform` metadata |
| `EAS_BUILD_PROFILE` | optional | (you set this) | Tagged as `eas_profile` metadata |
| `EAS_APP_VERSION` | optional | `${{ after.<job>.outputs.app_version }}` | Tagged as `eas_app_version` metadata |
| `EAS_GH_SHA` | optional | `${{ github.sha }}` | Tagged as `gh_sha` metadata |
| `EAS_GH_BRANCH` | optional | `${{ github.ref_name }}` | Tagged as `gh_branch` metadata |
| `EAS_GH_PR_NUMBER` | optional | `${{ github.event.pull_request.number }}` | Tagged as `gh_pr_number` metadata |
| `EAS_GH_PR_URL` | optional | `${{ github.event.pull_request.html_url }}` | Tagged as `gh_pr_url` metadata |
| `EAS_GH_REPO` | optional | `${{ github.repository }}` | Tagged as `gh_repo` metadata |
| `EAS_GH_RUN_ID` | optional | `${{ github.run_id }}` | Tagged as `gh_run_id` metadata |
| `DEVICE_CLOUD_API_URL` | optional | — | Override API URL (staging only) |
| `DCD_USE_BETA` | optional | — | Set to `true` to use the beta CLI |

### CLI flags

Everything you pass after `npx @devicecloud.dev/eas-workflow@v0 ...` is forwarded verbatim to `dcd cloud`. Common ones:

- `--flows <path>` — directory of Maestro flows (e.g. `./.maestro`)
- `--android-device <model>` — `pixel-6`, `pixel-7`, `pixel-7-pro`, …
- `--android-api-level <n>` — `29`–`36`
- `--ios-device <model>` — `iphone-16`, `iphone-16-pro`, …
- `--ios-version <n>` — `16`, `17`, `18`, `26`
- `--maestro-version <semver>`
- `--include-tags`, `--exclude-tags`
- `--retry <n>`
- `--async`
- `--google-play`

See [docs.devicecloud.dev/cli](https://docs.devicecloud.dev/cli) for the full list.

## Outputs

Emitted as `set-output <name> <value>` lines on stdout and surfaced as EAS step outputs:

| Output | Type | Description |
|---|---|---|
| `console_url` | string | Direct link to the test run in the Device Cloud console |
| `upload_status` | `PASSED` \| `FAILED` \| `CANCELLED` \| `PENDING` \| `RUNNING` | Final status of the run |
| `app_binary_id` | string | ID of the uploaded app binary (reuse with `--app-binary-id` for faster reruns) |
| `flow_results` | JSON string | Array of `{name, status}` per flow |

Reference downstream like `${{ steps.dcd.outputs.console_url }}` (same job) or `${{ needs.e2e.outputs.console_url }}` (different job, with `needs:` / `after:`).

## Exit codes

- `0` — all flows passed, or the wrapper ran in async mode
- `1` — at least one flow failed, the run was cancelled, or the wrapper hit an internal error

## Choosing a runner

`linux-medium` is fine for the wrapper itself — it just shells out to the Device Cloud platform, which runs your devices remotely. macOS runners are not required for iOS flows (the iOS simulators live on Device Cloud's Mac fleet).

## Migrating from `maestro-cloud`

EAS's built-in `maestro-cloud` job is hardcoded to Maestro Cloud. Swap the whole job for a `runs_on` custom job:

```yaml
# Before
e2e:
  type: maestro-cloud
  params:
    build_id: ${{ after.build.outputs.build_id }}
    maestro_project_id: proj_xxx
    flows: ./.maestro
    maestro_api_key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}

# After
e2e:
  after: [build]
  runs_on: linux-medium
  steps:
    - id: dcd
      run: npx --yes @devicecloud.dev/eas-workflow@v0 --flows ./.maestro
      env:
        DEVICE_CLOUD_API_KEY: ${{ secrets.DEVICE_CLOUD_API_KEY }}
        EAS_BUILD_URL: ${{ after.build.outputs.build_url }}
```

## Releases

The wrapper auto-bundles `dist/index.js` on push to `main`. Pin to a major (`@v0`) for stability or a specific version (`@0.1.0`) for reproducibility.
