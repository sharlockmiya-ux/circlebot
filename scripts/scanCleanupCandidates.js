// scripts/scanCleanupCandidates.js
// v15 cleanup helper (CommonJS). Prints candidates; deletes only with --apply.
// Usage:
//   node scripts/scanCleanupCandidates.js
//   node scripts/scanCleanupCandidates.js --apply

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const APPLY = process.argv.includes('--apply');

function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function statSafe(p) {
  try { return fs.statSync(p); } catch { return null; }
}

function isEmptyDir(dirPath) {
  try {
    const items = fs.readdirSync(dirPath);
    return items.length === 0;
  } catch {
    return false;
  }
}

function rm(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function rel(p) {
  return path.relative(ROOT, p).replace(/\\/g, '/');
}

const candidates = [
  { p: path.join(ROOT, 'features'), reason: '旧 features/（src/features 移行済なら不要）' },
  { p: path.join(ROOT, 'src', 'index.js'), reason: '旧入口が残っている可能性（bot.js起点なら不要）' },
  { p: path.join(ROOT, 'src', 'utils'), reason: '空なら整理候補（必要物があれば残す）', checkEmptyDir: true },
  { p: path.join(ROOT, 'src', 'constants', 'texts.js'), reason: '空ファイルなら整理候補（本文を集約するなら残す）', checkEmptyFile: true },
];

const found = [];

for (const c of candidates) {
  if (!exists(c.p)) continue;

  const st = statSafe(c.p);
  if (!st) continue;

  if (c.checkEmptyDir && st.isDirectory() && !isEmptyDir(c.p)) {
    continue; // non-empty => do not propose
  }
  if (c.checkEmptyFile && st.isFile()) {
    const size = st.size ?? 0;
    if (size > 0) continue;
  }

  found.push({
    path: c.p,
    rel: rel(c.p),
    type: st.isDirectory() ? 'dir' : 'file',
    reason: c.reason,
  });
}

if (found.length === 0) {
  console.log('[cleanup] No candidates found. (Good!)');
  process.exit(0);
}

console.log('[cleanup] Candidates (review before delete):');
for (const f of found) {
  console.log(`- ${f.rel} (${f.type}) : ${f.reason}`);
}

if (!APPLY) {
  console.log('\n[cleanup] Dry-run only. To delete these, rerun with: --apply');
  process.exit(0);
}

console.log('\n[cleanup] APPLY mode: deleting...');
for (const f of found) {
  try {
    rm(f.path);
    console.log(`✔ deleted: ${f.rel}`);
  } catch (e) {
    console.log(`✖ failed: ${f.rel}`);
    console.log(e?.message || e);
  }
}

console.log('[cleanup] Done.');
