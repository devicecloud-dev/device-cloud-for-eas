# Device Cloud for EAS Workflows

Run your Maestro flows on [devicecloud.dev](https://devicecloud.dev) from [EAS Workflows](https://docs.expo.dev/eas/workflows/get-started/). A drop-in alternative to Expo's `maestro-cloud` job type.

## Quick Start

```yaml
jobs:
  build_android:
    type: build
    params:
      platform: android
      profile: preview

  e2e:
    needs: [build_android]
    runs_on: linux-medium
    steps:
      - uses: eas/checkout
      - id: download
        uses: eas/download_build
        with:
          build_id: ${{ needs.build_android.outputs.build_id }}
      - id: dcd
        run: |
          npx --yes @devicecloud.dev/eas-workflow@v1 \
            --app-file ${{ steps.download.outputs.artifact_path }} \
            --flows ./.maestro
```

> **Don't** name your env-block keys `EAS_BUILD_ID` or anything starting with `EAS_BUILD_*` — that namespace is reserved by EAS Build workers, and clobbering `EAS_BUILD_ID` will cause your custom job to fail silently after `PREPARE_PROJECT` with no error message. Use the wrapper's `DCD_EAS_*` env-var contract instead (see [examples/](./examples/)).

Before running, store your DeviceCloud API key as an EAS project secret named `DEVICE_CLOUD_API_KEY`:

```bash
eas env:create --scope project --environment production --environment preview --environment development \
  --name DEVICE_CLOUD_API_KEY --visibility secret --type string --value <your-api-key>
```

EAS automatically injects project-scoped secrets into every step as process environment variables — **don't** reference them via `${{ secrets.X }}` in YAML (that syntax isn't supported by EAS Workflows).

## Cancelling superseded runs

Every `dcd cloud` flag is forwarded verbatim, so `--cancel-previous` works
here too. It cancels the still-queued tests of the previous run of this job on
the same branch or PR:

```yaml
- run: |
    npx --yes @devicecloud.dev/eas-workflow@v1 \
      --app-file ${{ steps.download.outputs.artifact_path }} \
      --flows ./.maestro \
      --cancel-previous
```

The previous run is found from the job's `DCD_GH_*` env vars: set
`DCD_GH_REPO` and `DCD_GH_BRANCH` (or `DCD_GH_PR_NUMBER`), or nothing is
cancelled. The [examples](./examples/) don't set `DCD_GH_REPO`; the
[env var reference](https://docs.devicecloud.dev/ci-cd/eas-workflows) gives the
expression and its manual-trigger caveat.

Give the iOS and Android jobs of one workflow their own `DCD_CHECK_NAME` (as the
examples do), or one shared `DCD_GH_RUN_ID` that is unique to the workflow run.
DeviceCloud never cancels a run that shares a run ID with the new one, but each
job here reports its own build (`DCD_EAS_BUILD_ID`), so the two jobs don't count
as one run: with neither set, whichever job submits second cancels the other's
queued tests.

Only queued tests are cancelled; anything already on a device finishes and
reports normally. Cancelled tests are refunded at 75%. From
`@devicecloud.dev/eas-workflow` 1.4.0, the superseded run's job passes, with
`upload_status` set to `SUPERSEDED`. Earlier versions fail it, because its
cancelled tests roll the run up to `FAILED`.

## Documentation

Full documentation including all environment variables, CLI flags, outputs, and migration notes:

**[docs.devicecloud.dev/ci-cd/eas-workflows](https://docs.devicecloud.dev/ci-cd/eas-workflows)**

## Migrating from `maestro-cloud`

Replace the whole job — EAS's built-in `maestro-cloud` is hardcoded to Maestro Cloud:

```yaml
# Before
e2e:
  type: maestro-cloud
  params:
    build_id: ${{ needs.build.outputs.build_id }}
    maestro_project_id: proj_xxx
    flows: ./.maestro
    maestro_api_key: ${{ secrets.MAESTRO_CLOUD_API_KEY }}

# After
e2e:
  needs: [build]
  runs_on: linux-medium
  steps:
    - id: download
      uses: eas/download_build
      with:
        build_id: ${{ needs.build.outputs.build_id }}
    - run: |
        npx --yes @devicecloud.dev/eas-workflow@v1 \
          --app-file ${{ steps.download.outputs.artifact_path }} \
          --flows ./.maestro
```
