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
here with no wrapper support needed. It cancels the still-queued tests of the
previous run of this job on the same branch or PR:

```yaml
- run: |
    npx --yes @devicecloud.dev/eas-workflow@v1 \
      --app-file ${{ steps.download.outputs.artifact_path }} \
      --flows ./.maestro \
      --cancel-previous
```

The context comes from the `DCD_GH_*` env vars the job already sets, so
`DCD_GH_BRANCH` (or `DCD_GH_PR_NUMBER`) and `DCD_GH_REPO` must be present or
nothing is cancelled. Set `DCD_CHECK_NAME` per job when a commit runs this more
than once — it scopes the group, so without it the iOS job would cancel the
Android job's queued tests.

Only queued tests are cancelled; anything already on a device finishes and
reports normally. Cancelled tests are refunded at 75%, and the superseded run
exits 0 rather than failing your workflow.

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
