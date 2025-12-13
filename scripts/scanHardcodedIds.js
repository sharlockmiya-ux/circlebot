/**
 * Scan for hardcoded Discord Snowflake-like IDs (17-20 digits) in code.
 *
 * Usage:
 *   node scripts/scanHardcodedIds.js
 *
 * Notes:
 * - This is a safety check. IDs in src/config/servers/main.json and docs are expected.
 * - Adjust EXCLUDE_DIRS / EXCLUDE_FILES as needed.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const EXCLUDE_DIRS = new Set([
  'node_modules',
  '.git',
  'docs', // inventory/diff docs may contain IDs by design
]);

const EXCLUDE_FILES = new Set([
  path.join('src', 'config', 'servers', 'main.json'),
]);

const TARGET_GLOBS = [
  'bot.js',
  path.join('src'),
  path.join('scripts'),
];

const ID_RE = /\b\d{17,20}\b/g;

function isExcluded(relPath) {
  // file exclude
  if (EXCLUDE_FILES.has(relPath)) return true;

  // dir exclude
  const parts = relPath.split(path.sep);
  if (parts.some((p) => EXCLUDE_DIRS.has(p))) return true;

  return false;
}

function walk(p, out) {
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    for (const name of fs.readdirSync(p)) {
      walk(path.join(p, name), out);
    }
  } else if (st.isFile()) {
    out.push(p);
  }
}

function scanFile(absPath) {
  const relPath = path.relative(ROOT, absPath);
  if (isExcluded(relPath)) return [];

  // only scan typical text files (avoid binaries)
  const ext = path.extname(absPath).toLowerCase();
  const base = path.basename(absPath);
  const allowed =
    base === 'bot.js' ||
    ['.js', '.cjs', '.mjs', '.json'].includes(ext);

  if (!allowed) return [];

  const buf = fs.readFileSync(absPath);
  const text = buf.toString('utf8');

  const hits = [];
  let m;
  while ((m = ID_RE.exec(text)) !== null) {
    // get line/col
    const idx = m.index;
    const before = text.slice(0, idx);
    const line = before.split('\n').length;
    const col = idx - before.lastIndexOf('\n');
    hits.push({ id: m[0], line, col });
  }
  if (!hits.length) return [];

  return [{ relPath, hits }];
}

function main() {
  const files = [];
  for (const t of TARGET_GLOBS) {
    const abs = path.join(ROOT, t);
    if (!fs.existsSync(abs)) continue;
    walk(abs, files);
  }

  const results = [];
  for (const f of files) {
    try {
      results.push(...scanFile(f));
    } catch (e) {
      // ignore unreadable/binary edge cases
    }
  }

  if (!results.length) {
    console.log('✅ No hardcoded 17-20 digit IDs found in code (excluding config/docs).');
    process.exit(0);
  }

  console.log('⚠️ Hardcoded ID candidates found (excluding config/docs):');
  for (const r of results) {
    for (const h of r.hits) {
      console.log(`- ${r.relPath}:${h.line}:${h.col}  ${h.id}`);
    }
  }
  console.log('\nIf these are legitimate, consider moving them into src/config/servers/main.json (or .env) and referencing cfg/env from code.');
  process.exitCode = 1;
}

main();
