// Remove build output and the HTTP cache.
import { rm } from 'node:fs/promises';

for (const dir of ['dist', '.cache']) {
  await rm(dir, { recursive: true, force: true });
  console.log(`removed ${dir}/`);
}
