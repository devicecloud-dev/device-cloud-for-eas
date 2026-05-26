export function setOutput(name: string, value: string): void {
  const oneLine = value.replace(/\r?\n/g, ' ');
  process.stdout.write(`set-output ${name} ${oneLine}\n`);
}

export function escapeShellValue(value: string): string {
  return value.replace(/(["\\'$`!\s\[\]{}()&|;<>*?#^~])/g, '\\$1');
}
