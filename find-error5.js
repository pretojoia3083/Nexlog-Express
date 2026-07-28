const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const file = fs.readFileSync('src/app/page.tsx', 'utf8');
const lines = file.split('\n');

function testFile(content) {
  const tmpFile = path.join(process.cwd(), '_test_rep.tsx');
  fs.writeFileSync(tmpFile, content);
  try {
    const out = execSync(`npx esbuild _test_rep.tsx --jsx=automatic --loader:.tsx=tsx --outfile=/dev/null 2>&1`, { encoding: 'utf8', timeout: 15000 });
    return true;
  } catch (e) {
    return e.stdout || e.stderr || 'error';
  } finally {
    try { fs.unlinkSync(tmpFile); } catch(ex) {}
  }
}

// The approach: find every line that contains > inside {} expression
// and try removing that line (replacing with empty) to see if error goes away
// Focus on the area near line 901

console.log('Testing full file:');
const fullErr = testFile(file);
console.log(`  Result: ${typeof fullErr === 'string' ? fullErr.split('\n').filter(l=>l.includes('ERROR')).join(' | ') : 'OK'}`);

// For each line from 800-902, try commenting it out and testing
for (let i = 800; i <= 902; i++) {
  if (!lines[i-1]) continue;
  const testLines = [...lines];
  testLines[i-1] = '/* ' + testLines[i-1] + ' */';
  process.stdout.write(`Comment line ${i}... `);
  const r = testFile(testLines.join('\n'));
  if (r === true) {
    console.log('FIXED! Line ' + i + ': ' + lines[i-1].trim().substring(0, 80));
  }
}

// If none fixed it, try lines 783-800
for (let i = 783; i <= 800; i++) {
  if (!lines[i-1]) continue;
  const testLines = [...lines];
  testLines[i-1] = '/* ' + testLines[i-1] + ' */';
  process.stdout.write(`Comment line ${i}... `);
  const r = testFile(testLines.join('\n'));
  if (r === true) {
    console.log('FIXED! Line ' + i + ': ' + lines[i-1].trim().substring(0, 80));
  }
}

// Also try the critical area: what if it's a closing tag mismatch?
// Let me check line 828 area (missing <div>)
console.log('\n--- Checking structural issues ---');
// Add missing <div> before line 828
const fixed828 = [...lines];
fixed828.splice(827, 0, '              <div>');
// Need to find where to add matching </div>
// Looking at structure: 827 is </div> closing peso group, 828 is <label>, 829 is <input/>, 830 is </div>
// We added <div> before 828, so we need </div> before 830
fixed828.splice(831, 0, '              </div>');
process.stdout.write('Add missing <div> wrapper at 828... ');
const r = testFile(fixed828.join('\n'));
console.log(r === true ? 'FIXED!' : 'Still fails');

try { fs.unlinkSync(path.join(process.cwd(), '_test_rep.tsx')); } catch(ex) {}
