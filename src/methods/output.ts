import { execFileSync } from 'child_process';
import { writeFileSync } from 'fs';
import { join } from 'path';

type ExecFileSyncError = NodeJS.ErrnoException & {
  status?: number | null;
  signal?: NodeJS.Signals | null;
  stdout?: Buffer | string;
  stderr?: Buffer | string;
};

/**
 * Sets an EAS Workflows step output, which the workflow reads as
 * `steps.<step id>.outputs.<name>`.
 *
 * EAS reads a step's outputs from the files in $__EXPO_STEPS_OUTPUTS_DIR, one
 * per output, each holding the value in base64. It puts its own `set-output`
 * command, which writes them, on the step's PATH. A `set-output` line printed
 * to stdout sets nothing.
 */
export function setOutput(name: string, value: string): void {
  // Expo's set-output refuses an empty value (it exits 2), so an empty value
  // skips it and gets written directly below.
  if (value !== '') {
    try {
      // No shell runs, so the value needs no quoting.
      execFileSync('set-output', [name, value], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return;
    } catch (error) {
      const { code, signal, status, stdout, stderr } =
        error as ExecFileSyncError;
      // set-output never started. ENOENT: it isn't on PATH. E2BIG: the value
      // is too long for one argument (Linux caps one at 128 KiB), which
      // flow_results can be for a large run. Write the file ourselves.
      if (code !== 'ENOENT' && code !== 'E2BIG') {
        // It ran and failed. The verdict doesn't depend on the outputs, so
        // warn rather than fail the run.
        const printed = `${stdout ?? ''}${stderr ?? ''}`.trim();
        console.error(
          `Warning: set-output could not set ${name} ` +
            `(${code ?? signal ?? `exit code ${status}`})` +
            (printed ? `: ${printed}` : '')
        );
        return;
      }
    }
  }

  const outputsDir = process.env.__EXPO_STEPS_OUTPUTS_DIR;
  if (outputsDir) {
    try {
      // The file set-output writes: the value in base64, nothing else.
      writeFileSync(
        join(outputsDir, name),
        Buffer.from(value).toString('base64')
      );
    } catch (error) {
      console.error(
        `Warning: could not set ${name}: ${(error as Error).message}`
      );
    }
    return;
  }

  // Not in an EAS step (a local run): print the output on one line instead.
  const oneLine = value.replace(/\r?\n/g, ' ');
  process.stdout.write(`set-output ${name} ${oneLine}\n`);
}

export function escapeShellValue(value: string): string {
  return value.replace(/(["\\'$`!\s\[\]{}()&|;<>*?#^~])/g, '\\$1');
}
