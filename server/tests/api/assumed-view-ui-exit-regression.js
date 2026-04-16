import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');

const rootLayoutPath = path.join(repoRoot, 'client', 'app', 'root.tsx');
const routePaths = [
  path.join(repoRoot, 'client', 'app', 'routes', 'driver', 'catalogs.tsx'),
  path.join(repoRoot, 'client', 'app', 'routes', 'driver', 'orders.tsx'),
  path.join(repoRoot, 'client', 'app', 'routes', 'sponsor', 'dashboard.tsx'),
  path.join(repoRoot, 'client', 'app', 'routes', 'admin', 'dashboard.tsx'),
  path.join(repoRoot, 'client', 'app', 'routes', 'sponsor', 'catalogs.tsx'),
  path.join(repoRoot, 'client', 'app', 'routes', 'driver-dashboard.tsx'),
  path.join(repoRoot, 'client', 'app', 'routes', 'driver', 'profile', '$id', 'edit.tsx'),
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

async function readText(filePath) {
  return fs.readFile(filePath, 'utf8');
}

async function run() {
  console.log('Running assumed-view exit UI regression checks...');

  const rootSource = await readText(rootLayoutPath);
  const rootExitLabelCount = countOccurrences(rootSource, 'Exit Assumed View');
  const rootExitActionCount = countOccurrences(rootSource, 'action="/exit-assumption"');

  assert(
    rootExitLabelCount === 1,
    `Expected exactly one "Exit Assumed View" label in root layout, found ${rootExitLabelCount}`
  );
  assert(
    rootExitActionCount === 1,
    `Expected exactly one '/exit-assumption' form action in root layout, found ${rootExitActionCount}`
  );

  for (const routePath of routePaths) {
    const source = await readText(routePath);
    const hasExitLabel = source.includes('Exit Assumed View');
    const hasExitAction = source.includes('action="/exit-assumption"');

    assert(!hasExitLabel, `Unexpected "Exit Assumed View" label in ${path.relative(repoRoot, routePath)}`);
    assert(!hasExitAction, `Unexpected '/exit-assumption' form action in ${path.relative(repoRoot, routePath)}`);
  }

  console.log('PASS: only root assumed-view banner contains the exit control.');
}

run().catch((error) => {
  console.error('Test failed:', error.message);
  process.exit(1);
});
