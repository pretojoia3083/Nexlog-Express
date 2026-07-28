const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const file = fs.readFileSync('src/app/page.tsx', 'utf8');
const lines = file.split('\n');

// renderCalculadora spans lines 783-902 (1-indexed)
const fnStart = 783;
const fnEnd = 902; // inclusive

// The function body lines are 784-901 (783 = const declaration, 902 = );
// We want to test with partial body.
// Replace the function with a minimal version that has part of the original body.

function testWithPartialBody(bodyEndLine) {
  // Build new file: everything before fnStart, minimal function, everything after fnEnd
  const before = lines.slice(0, fnStart - 1).join('\n');
  const body = lines.slice(fnStart, bodyEndLine - 1).join('\n'); // lines 784 to bodyEndLine-1
  const after = lines.slice(fnEnd).join('\n'); // from line 903 onward
  
  // Minimal function: just the body up to bodyEndLine, then close with return <div/>, close parens
  const newFile = before + '\n' + 
    "  const renderCalculadora = () => (\n" + 
    body + '\n' +
    "    <div>placeholder</div>\n" +
    "  );\n" + 
    after;
  
  const tmpFile = path.join(process.cwd(), '_test_chunk.tsx');
  fs.writeFileSync(tmpFile, newFile);
  try {
    execSync(`npx esbuild _test_chunk.tsx --jsx=automatic --loader:.tsx=tsx --outfile=/dev/null 2>nul`, { encoding: 'utf8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] });
    return true;
  } catch (e) {
    const stderr = e.stderr || '';
    const errMsg = stderr.split('\n').filter(l => l.includes('error') || l.includes('ERROR')).join(' | ');
    return { error: errMsg };
  } finally {
    try { fs.unlinkSync(tmpFile); } catch(ex) {}
  }
}

console.log(`Testing full file with partial renderCalculadora body`);
console.log(`Function spans lines ${fnStart}-${fnEnd}`);

// Binary search the body
let lo = fnStart + 1; // first line of body
let hi = fnEnd - 1;   // last line of body before closing );

// First check: does the full body work?
process.stdout.write(`Full body... `);
const fullResult = testWithPartialBody(fnEnd - 1);
console.log(fullResult === true ? 'OK' : 'ERROR');

if (fullResult === true) {
  console.log('renderCalculadora is fine - error is elsewhere!');
  process.exit(0);
}

// Binary search
while (lo < hi) {
  const mid = Math.floor((lo + hi) / 2);
  process.stdout.write(`Body lines ${fnStart+1}-${mid}... `);
  const result = testWithPartialBody(mid);
  console.log(result === true ? 'OK' : 'ERROR');
  if (result === true) {
    lo = mid + 1;
  } else {
    hi = mid;
  }
}

console.log(`\nFirst error at body line ${lo}`);
console.log(`Context (lines ${Math.max(fnStart+1,lo-3)}-${lo+2}):`);
for (let i = Math.max(fnStart, lo - 4); i <= Math.min(fnEnd - 2, lo + 1); i++) {
  console.log(`${i + 1}${i + 1 === lo ? ' >>>' : '    '}: ${lines[i]}`);
}

// Try removing that line
console.log(`\nTest without line ${lo}:`);
const before = lines.slice(0, fnStart - 1).join('\n');
const bodyNoLine = lines.slice(fnStart, fnEnd - 1).filter((_, i) => i !== lo - fnStart).join('\n');
const after = lines.slice(fnEnd).join('\n');
const testFile = before + '\n  const renderCalculadora = () => (\n' + bodyNoLine + '\n    <div>placeholder</div>\n  );\n' + after;
const tmpFile = path.join(process.cwd(), '_test_chunk.tsx');
fs.writeFileSync(tmpFile, testFile);
try {
  execSync(`npx esbuild _test_chunk.tsx --jsx=automatic --loader:.tsx=tsx --outfile=/dev/null 2>nul`, { encoding: 'utf8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] });
  console.log(`Line ${lo} IS the problem!`);
} catch (e) {
  console.log(`Line ${lo} is NOT the sole problem (nesting issue)`);
} finally {
  try { fs.unlinkSync(tmpFile); } catch(ex) {}
}
