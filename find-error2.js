const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const file = fs.readFileSync('src/app/page.tsx', 'utf8');
const totalLines = file.split('\n').length;
console.log('Total lines:', totalLines);

function testUpTo(line) {
  const allLines = file.split('\n');
  const part = allLines.slice(0, line).join('\n');
  // Need to close everything: close the component function
  const closing = '\n}\n';
  const tmpFile = path.join(process.cwd(), '_test_up.tsx');
  fs.writeFileSync(tmpFile, part + closing);
  try {
    execSync(`npx esbuild _test_up.tsx --jsx=automatic --loader:.tsx=tsx --outfile=/dev/null 2>nul`, { encoding: 'utf8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] });
    return true;
  } catch (e) {
    return false;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch(ex) {}
  }
}

// Binary search the ENTIRE file
let lo = 1, hi = totalLines;
while (lo < hi) {
  const mid = Math.floor((lo + hi) / 2);
  process.stdout.write(`Lines 1-${mid}... `);
  const ok = testUpTo(mid);
  console.log(ok ? 'OK' : 'ERROR');
  if (ok) lo = mid + 1;
  else hi = mid;
}

console.log(`\nFirst error at line ${lo}`);
const allLines = file.split('\n');
for (let i = Math.max(0, lo - 5); i <= Math.min(totalLines - 1, lo + 3); i++) {
  console.log(`${i + 1}${i + 1 === lo ? ' >>>' : '    '}: ${allLines[i]}`);
}

// Clean up
try { fs.unlinkSync(path.join(process.cwd(), '_test_up.tsx')); } catch(ex) {}
