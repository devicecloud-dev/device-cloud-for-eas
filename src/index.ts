#!/usr/bin/env node
import { spawn } from 'child_process';
import { getEnv } from './methods/env';
import { setOutput, escapeShellValue } from './methods/output';

const dcdPackageName = '@devicecloud.dev/dcd';

interface TestResult {
  name: string;
  status: 'PASSED' | 'FAILED' | 'CANCELLED' | 'PENDING' | 'RUNNING';
}

interface StatusResponse {
  status: 'PASSED' | 'FAILED' | 'CANCELLED' | 'PENDING' | 'RUNNING';
  tests: TestResult[];
  consoleUrl?: string;
  appBinaryId?: string;
}

const executeCommand = (
  command: string,
  log: boolean = true
): Promise<{ output: string; exitCode: number }> => {
  return new Promise((resolve, reject) => {
    let output = '';

    const child = spawn(command, { shell: true });

    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      if (log) {
        process.stderr.write(chunk);
      }
    });

    child.stderr.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      if (log) {
        process.stderr.write(chunk);
      }
    });

    child.on('close', (code) => {
      resolve({ output, exitCode: code ?? 0 });
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
};

const getLatestDcdVersion = async (useBeta: boolean): Promise<string> => {
  try {
    if (useBeta) {
      console.error('Using beta version of DCD CLI');
      return `${dcdPackageName}@beta`;
    }
    const { output } = await executeCommand(
      `npm view ${dcdPackageName} version`,
      false
    );
    const version = output.trim();
    console.error(`Latest DCD version from npm: ${version}`);
    return `${dcdPackageName}@${version}`;
  } catch (error) {
    console.error(
      'Failed to fetch latest DCD version, falling back to >=5.0.0:',
      error
    );
    return `${dcdPackageName}@>=5.0.0`;
  }
};

const getTestStatus = async (
  uploadId: string,
  apiKey: string,
  dcdVersionString: string,
  apiUrl?: string
): Promise<StatusResponse | null> => {
  try {
    let command = `npx --yes "${dcdVersionString}" status --json --upload-id ${uploadId} --api-key ${escapeShellValue(
      apiKey
    )}`;
    if (apiUrl) {
      command += ` --api-url ${escapeShellValue(apiUrl)}`;
    }
    const { output } = await executeCommand(command, false);

    const lines = output.split('\n');
    const jsonStartIndex = lines.findIndex((line) => {
      const trimmed = line.trim();
      return trimmed.startsWith('{') || trimmed.startsWith('[');
    });

    if (jsonStartIndex === -1) {
      throw new Error('No JSON found in status output');
    }

    const jsonOutput = lines.slice(jsonStartIndex).join('\n');
    return JSON.parse(jsonOutput);
  } catch (error) {
    console.error('Failed to get test status:', error);
    return null;
  }
};

const run = async (): Promise<void> => {
  try {
    const env = getEnv();
    const dcdVersionString = await getLatestDcdVersion(env.useBeta);

    const flags: string[] = [
      `--apiKey ${escapeShellValue(env.apiKey)}`,
      '--quiet',
    ];

    if (env.apiUrl) {
      flags.push(`--api-url ${escapeShellValue(env.apiUrl)}`);
    }
    if (env.buildUrl) {
      flags.push(`--app-url ${escapeShellValue(env.buildUrl)}`);
    }
    for (const pair of env.metadata) {
      flags.push(`--metadata ${escapeShellValue(pair)}`);
    }

    const userArgs = process.argv.slice(2).map(escapeShellValue).join(' ');
    const cloudCommand = `npx --yes "${dcdVersionString}" cloud ${flags.join(
      ' '
    )} ${userArgs}`.trim();

    // Forward CI identity so DCD notices can target this EAS integration (e.g.
    // by version). The CLI reads these env vars; the spawned child inherits
    // process.env. Provider alone still enables CI-surface notices.
    process.env.DCD_CI_PROVIDER = 'eas';
    try {
      process.env.DCD_CI_WRAPPER_VERSION = (
        require('../package.json') as { version?: string }
      ).version;
    } catch {
      // best-effort — version is optional
    }

    let testOutput = '';
    let uploadId: string | null = null;

    try {
      const { output, exitCode } = await executeCommand(cloudCommand);
      testOutput = output;

      if (exitCode === 1) {
        throw new Error(
          'DeviceCloud CLI failed to run - check your parameters or contact support'
        );
      }
    } finally {
      uploadId =
        testOutput?.match(
          /https:\/\/(?:dev\.)?console\.devicecloud\.dev\/results\?upload=([a-zA-Z0-9-]+)/
        )?.[1] || null;
    }

    if (!uploadId) {
      throw new Error('Failed to get upload ID from console URL');
    }

    const result = await getTestStatus(
      uploadId,
      env.apiKey,
      dcdVersionString,
      env.apiUrl
    );

    if (result) {
      setOutput('console_url', result.consoleUrl || '');
      setOutput('app_binary_id', result.appBinaryId || '');
      setOutput('upload_status', result.status || 'PENDING');

      const flowResults = (result.tests || []).map((test: TestResult) => ({
        name: test.name,
        status: test.status,
      }));
      setOutput('flow_results', JSON.stringify(flowResults));

      if (result.status === 'PASSED') {
        console.error('Successfully completed test run.');
        process.exit(0);
      } else if (result.status === 'FAILED' || result.status === 'CANCELLED') {
        console.error(
          `Test run ${result.status}. Check flow results: ${result.consoleUrl}`
        );
        process.exit(1);
      } else {
        console.error(`Test run finished with status: ${result.status}`);
        process.exit(0);
      }
    } else {
      setOutput('upload_status', 'ERROR');
      setOutput('flow_results', '[]');
      throw new Error('Failed to get test status');
    }
  } catch (error) {
    const message =
      typeof error === 'string' ? error : (error as Error).message;
    console.error(message);
    process.exit(1);
  }
};

run();
