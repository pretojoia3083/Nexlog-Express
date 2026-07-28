const fs = require('fs');
const { execFileSync } = require('child_process');
const path = require('path');

const esbuild = 'C:/Users/renato/AppData/Local/npm-cache/_npx/beb367dfa21eb3f5/node_modules/esbuild/bin/esbuild';
const file = fs.readFileSync('src/app/page.tsx', 'utf8');
const lines = file.split('\n');

function testFile(content) {
  const tmpFile = path.join(process.cwd(), '_test_chunk.tsx');
  fs.writeFileSync(tmpFile, content);
  try {
    execFileSync(process.execPath, [esbuild, '_test_chunk.tsx', '--jsx=automatic', '--loader:.tsx=tsx', '--outfile=NUL'], { timeout: 10000, stdio: 'pipe' });
    return true;
  } catch (e) {
    const stdout = (e.stdout || '').toString();
    const stderr = (e.stderr || '').toString();
    const errMsg = (stdout + stderr).split('\n').filter(l => l.includes('ERROR') || l.includes('error')).join(' | ');
    return errMsg || false;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch(ex) {}
  }
}

// Test removing large blocks
const ranges = [
  [1, 100], [101, 200], [201, 300], [301, 400], [401, 500], 
  [501, 600], [601, 700], [701, 800], [801, 900], [901, 1000],
  [1001, 1100], [1101, 1200], [1201, 1326]
];

for (const [start, end] of ranges) {
  const removed = lines.filter((_, i) => i < start - 1 || i >= end);
  process.stdout.write(`Remove lines ${start}-${end} (${end - start + 1} lines)... `);
  const r = testFile(removed.join('\n'));
  console.log(r === true ? 'OK (FIXED!)' : (typeof r === 'string' ? 'Still error' : 'FAIL'));
}
