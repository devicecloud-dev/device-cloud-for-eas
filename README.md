# Device Cloud for EAS Workflows

Run your Maestro flows on [devicecloud.dev](https://devicecloud.dev) from [EAS Workflows](https://docs.expo.dev/eas/workflows/get-started/). A drop-in alternative to Expo's `maestro-cloud` job type.

## Quick Start

```yaml
jobs:
  e2e:
    after: [build_android]
    runs_on: linux-medium
    steps:
      - id: dcd
        run: npx --yes @devicecloud.dev/eas-workflow@v0 --flows ./.maestro
        env:
          DEVICE_CLOUD_API_KEY: ${{ secrets.DEVICE_CLOUD_API_KEY }}
          EAS_BUILD_URL: ${{ after.build_android.outputs.build_url }}
```

## Documentation

Full documentation including all environment variables, CLI flags, outputs, and usage examples is available at:

**[docs.devicecloud.dev/ci-cd/eas-workflows](https://docs.devicecloud.dev/ci-cd/eas-workflows)**

## Migrating from `maestro-cloud`

Replace the whole job — EAS's `maestro-cloud` is closed-source and hardcoded to Maestro Cloud:

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
    - run: npx --yes @devicecloud.dev/eas-workflow@v0 --flows ./.maestro
      env:
        DEVICE_CLOUD_API_KEY: ${{ secrets.DEVICE_CLOUD_API_KEY }}
        EAS_BUILD_URL: ${{ after.build.outputs.build_url }}
```
