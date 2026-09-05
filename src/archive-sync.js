// Fetch the archive into archive/ from its own branch.
//
// The archive lives on `archive-data` rather than on main, so CI never commits
// to the branch people work on. That means a fresh clone has no archive/ until
// this runs. Building without it still works — the site just starts from
// whatever is inside the freshness window — but the archive pages will be thin.
//
//   npm run archive:pull

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const BRANCH = 'archive-data';
const DIR = 'archive';

const git = (args, opts = {}) =>
  execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();

function originUrl() {
  try {
    return git(['remote', 'get-url', 'origin']);
  } catch {
    console.error('No "origin" remote — nothing to pull from.');
    process.exit(1);
  }
}

try {
  if (existsSync(path.join(DIR, '.git'))) {
    // Already a checkout of the branch: fast-forward it.
    git(['-C', DIR, 'fetch', 'origin', BRANCH]);
    git(['-C', DIR, 'checkout', '-q', BRANCH]);
    git(['-C', DIR, 'reset', '--hard', `origin/${BRANCH}`]);
    console.log(`archive/ updated to origin/${BRANCH}`);
  } else if (existsSync(DIR)) {
    // Untracked local files — don't clobber work that isn't committed anywhere.
    console.error(
      `archive/ exists but is not a checkout of ${BRANCH}.\n` +
      `Move or delete it first, then re-run. Its contents are not committed to main.`
    );
    process.exit(1);
  } else {
    git(['clone', '--quiet', '--branch', BRANCH, '--single-branch', originUrl(), DIR]);
    console.log(`archive/ cloned from ${BRANCH}`);
  }
} catch (err) {
  const msg = (err.stderr || err.message || '').toString().trim();
  console.error(`Could not sync the archive: ${msg}`);
  console.error(`If ${BRANCH} does not exist yet, the first scheduled build will create it.`);
  process.exit(1);
}
