import { execFileSync } from 'child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { delimiter, join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { escapeShellValue, setOutput } from './output';

// The real execFileSync, wrapped so tests can see how set-output was called.
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return { ...actual, execFileSync: vi.fn(actual.execFileSync) };
});

// Expo's set-output, which EAS puts on every step's PATH. Copied verbatim from
// expo/eas-cli packages/steps/bin/set-output.
const EXPO_SET_OUTPUT = `#!/usr/bin/env bash

set -eo pipefail

NAME=$1
VALUE=$2

if [[ -z "$__EXPO_STEPS_OUTPUTS_DIR" ]]; then
  echo "Set __EXPO_STEPS_OUTPUTS_DIR"
  exit 1
fi

if [[ -z "$NAME" || -z "$VALUE" ]]; then
  echo "Usage: set-output NAME VALUE"
  exit 2
fi

if [[ "$OSTYPE" == "linux"* ]]; then
  echo -n "$VALUE" | base64 -w 0 > $__EXPO_STEPS_OUTPUTS_DIR/$NAME
else
  echo -n "$VALUE" | base64 > $__EXPO_STEPS_OUTPUTS_DIR/$NAME
fi
`;

const ORIGINAL_PATH = process.env.PATH;

// How EAS reads an output back (BuildStep.collectAndValidateOutputsAsync in
// expo/eas-cli).
function readOutput(outputsDir: string, name: string): string {
  const raw = readFileSync(join(outputsDir, name), 'utf-8');
  return Buffer.from(raw, 'base64').toString('utf-8');
}

const VALUES: Array<[label: string, value: string]> = [
  ['a plain value', 'PASSED'],
  [
    'a URL',
    'https://console.devicecloud.dev/results?upload=abc-123&result=456',
  ],
  ['spaces and quotes', 'my "quoted" value, it\'s $HOME and `ls` & more'],
  [
    'JSON',
    JSON.stringify([
      { name: 'Login "happy" path', status: 'PASSED' },
      { name: "it's a flow", status: 'FAILED' },
    ]),
  ],
  ['several lines', 'line1\nline2\r\nline3'],
  ['non-ASCII text', 'Tëst ✓ 日本語'],
];

describe('escapeShellValue', () => {
  it('leaves plain alphanumeric values untouched', () => {
    expect(escapeShellValue('pixel-6')).toBe('pixel-6');
    expect(escapeShellValue('abc123')).toBe('abc123');
  });

  it('escapes whitespace', () => {
    expect(escapeShellValue('My Run')).toBe('My\\ Run');
  });

  it('escapes shell-significant characters that could enable injection', () => {
    expect(escapeShellValue('$VAR')).toBe('\\$VAR');
    expect(escapeShellValue('a"b')).toBe('a\\"b');
    expect(escapeShellValue("a'b")).toBe("a\\'b");
    expect(escapeShellValue('a;rm -rf /')).toBe('a\\;rm\\ -rf\\ /');
    expect(escapeShellValue('a|b')).toBe('a\\|b');
    expect(escapeShellValue('a&b')).toBe('a\\&b');
  });
});

describe('setOutput', () => {
  let tempDir: string;
  let outputsDir: string;
  let stdoutWrite: ReturnType<typeof vi.spyOn>;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(execFileSync).mockClear();
    tempDir = mkdtempSync(join(tmpdir(), 'eas-set-output-'));
    outputsDir = join(tempDir, 'outputs');
    mkdirSync(outputsDir);
    // By default nothing named set-output can be found and no outputs
    // directory is set, as in a local run. Each describe sets up its own.
    const emptyDir = join(tempDir, 'empty');
    mkdirSync(emptyDir);
    vi.stubEnv('PATH', emptyDir);
    vi.stubEnv('__EXPO_STEPS_OUTPUTS_DIR', undefined);
    stdoutWrite = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('in an EAS step, with set-output on PATH', () => {
    beforeEach(() => {
      const binDir = join(tempDir, 'bin');
      mkdirSync(binDir);
      writeFileSync(join(binDir, 'set-output'), EXPO_SET_OUTPUT, {
        mode: 0o755,
      });
      vi.stubEnv('PATH', `${binDir}${delimiter}${ORIGINAL_PATH}`);
      vi.stubEnv('__EXPO_STEPS_OUTPUTS_DIR', outputsDir);
    });

    it.each(VALUES)('stores %s through set-output', (_label, value) => {
      setOutput('flow_results', value);

      expect(execFileSync).toHaveBeenCalledWith(
        'set-output',
        ['flow_results', value],
        expect.anything()
      );
      expect(readOutput(outputsDir, 'flow_results')).toBe(value);
      expect(stdoutWrite).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
    });

    it('writes an empty value itself, since set-output refuses one', () => {
      setOutput('app_binary_id', '');

      expect(execFileSync).not.toHaveBeenCalled();
      expect(existsSync(join(outputsDir, 'app_binary_id'))).toBe(true);
      expect(readOutput(outputsDir, 'app_binary_id')).toBe('');
      expect(consoleError).not.toHaveBeenCalled();
    });

    it('writes the file itself when the value is too long for an argument', () => {
      // Over the per-argument (Linux) and total (macOS) limits, so spawning
      // set-output fails with E2BIG.
      const value = JSON.stringify([
        { name: 'x'.repeat(2 * 1024 * 1024), status: 'PASSED' },
      ]);

      setOutput('flow_results', value);

      expect(execFileSync).toHaveBeenCalledTimes(1);
      expect(readOutput(outputsDir, 'flow_results')).toBe(value);
      expect(consoleError).not.toHaveBeenCalled();
    });

    it('warns, without throwing, when set-output fails', () => {
      // Expo's script exits 1 without an outputs directory.
      vi.stubEnv('__EXPO_STEPS_OUTPUTS_DIR', undefined);

      expect(() => setOutput('upload_status', 'PASSED')).not.toThrow();

      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining(
          'set-output could not set upload_status (exit code 1): Set __EXPO_STEPS_OUTPUTS_DIR'
        )
      );
      expect(stdoutWrite).not.toHaveBeenCalled();
    });
  });

  describe('in an EAS step, without set-output on PATH', () => {
    beforeEach(() => {
      vi.stubEnv('__EXPO_STEPS_OUTPUTS_DIR', outputsDir);
    });

    it('writes the output file the way set-output does', () => {
      const value = JSON.stringify(
        [{ name: 'Login "happy" path', status: 'PASSED' }],
        null,
        2
      );

      setOutput('flow_results', value);

      expect(execFileSync).toHaveBeenCalledTimes(1);
      expect(readFileSync(join(outputsDir, 'flow_results'), 'utf-8')).toBe(
        Buffer.from(value).toString('base64')
      );
      expect(readOutput(outputsDir, 'flow_results')).toBe(value);
      expect(stdoutWrite).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
    });

    it('warns, without throwing, when the file cannot be written', () => {
      vi.stubEnv('__EXPO_STEPS_OUTPUTS_DIR', join(tempDir, 'missing'));

      expect(() => setOutput('upload_status', 'PASSED')).not.toThrow();

      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining('could not set upload_status')
      );
    });
  });

  describe('outside EAS', () => {
    it('prints a set-output line for the given name and value', () => {
      setOutput('upload_status', 'PASSED');

      expect(stdoutWrite).toHaveBeenCalledWith(
        'set-output upload_status PASSED\n'
      );
      expect(consoleError).not.toHaveBeenCalled();
    });

    it('collapses newlines in the value to single spaces so the line stays parseable', () => {
      setOutput('flow_results', 'line1\nline2\r\nline3');

      expect(stdoutWrite).toHaveBeenCalledWith(
        'set-output flow_results line1 line2 line3\n'
      );
    });
  });
});
