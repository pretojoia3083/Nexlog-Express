const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const file = fs.readFileSync('src/app/page.tsx', 'utf8');
const lines = file.split('\n');

function testWithReplacement(startLine, endLine, replacement) {
  const newLines = [...lines];
  newLines.splice(startLine - 1, endLine - startLine + 1, ...replacement.split('\n'));
  const tmpFile = path.join(process.cwd(), '_test_rep.tsx');
  fs.writeFileSync(tmpFile, newLines.join('\n'));
  try {
    execSync(`npx esbuild _test_rep.tsx --jsx=automatic --loader:.tsx=tsx --outfile=/dev/null 2>nul`, { encoding: 'utf8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] });
    return true;
  } catch (e) {
    const stderr = e.stderr || '';
    const msg = stderr.split('\n').filter(l => l.includes('error') || l.includes('ERROR')).join(' | ');
    return msg;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch(ex) {}
  }
}

// Find all render functions
const renderFns = [];
for (let i = 0; i < lines.length; i++) {
  const match = lines[i].match(/const (render\w+)\s*=/);
  if (match) {
    // Find the end: look for next const or end of arrow function
    let end = i;
    let depth = 0;
    for (let j = i; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === '(' || ch === '{' || ch === '<') depth++;
        if (ch === ')' || ch === '}' || ch === '>') depth--;
      }
      if (j > i && depth <= 0) {
        end = j;
        break;
      }
    }
    // Find the ); line
    for (let j = i + 2; j < lines.length; j++) {
      if (lines[j].match(/^\s*\);\s*$/)) {
        end = j;
        break;
      }
    }
    renderFns.push({ name: match[1], start: i + 1, end: end + 1 });
  }
}

console.log('Found render functions:');
renderFns.forEach(fn => {
  console.log(`  ${fn.name}: lines ${fn.start}-${fn.end}`);
});

// Test each function replaced with stub
for (const fn of renderFns) {
  process.stdout.write(`Replace ${fn.name} (${fn.start}-${fn.end}) with stub... `);
  const stub = `  const ${fn.name} = () => (<div>stub</div>);`;
  const result = testWithReplacement(fn.start, fn.end, stub);
  console.log(result === true ? 'OK (error WAS here)' : 'Still fails');
}
