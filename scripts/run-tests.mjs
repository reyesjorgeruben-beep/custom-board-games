import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

async function findTests(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return findTests(path);
    return entry.isFile() && entry.name.endsWith('.test.ts') ? [path] : [];
  }));
  return nested.flat();
}

const tests = (await Promise.all(['packages', 'services'].map(findTests))).flat().sort();
if (tests.length === 0) {
  console.error('No unit tests found.');
  process.exitCode = 1;
} else {
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...tests], {
    stdio: 'inherit',
  });
  process.exitCode = result.status ?? 1;
}
