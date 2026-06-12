import { afterEach, describe, expect, it, vi } from 'vitest';

import { escapeShellValue, setOutput } from './output';

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
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes a set-output line for the given name and value', () => {
    const spy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    setOutput('DEVICE_CLOUD_UPLOAD_STATUS', 'PASSED');
    expect(spy).toHaveBeenCalledWith(
      'set-output DEVICE_CLOUD_UPLOAD_STATUS PASSED\n'
    );
  });

  it('collapses newlines in the value to single spaces so the line stays parseable', () => {
    const spy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    setOutput('DEVICE_CLOUD_FLOW_RESULTS', 'line1\nline2\r\nline3');
    expect(spy).toHaveBeenCalledWith(
      'set-output DEVICE_CLOUD_FLOW_RESULTS line1 line2 line3\n'
    );
  });
});
