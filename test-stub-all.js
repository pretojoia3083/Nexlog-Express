const fs = require('fs');
process.env.NODE_PATH = 'C:\\Users\\Renato\\AppData\\Local\\npm-cache\\_npx\\beb367dfa21eb3f5\\node_modules';
require('module').Module._initPaths();
const { buildSync } = require('esbuild');

const filePath = 'C:\\Users\\Renato\\OneDrive\\Desktop\\nexlog\\src\\app\\page.tsx';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Test original first
function testContent(code, label) {
  const testFile = 'C:\\Users\\Renato\\AppData\\Local\\Temp\\test-full.tsx';
  fs.writeFileSync(testFile, code);
  try {
    buildSync({ entryPoints: [testFile], bundle: false, write: false, logLevel: 'silent', jsx: 'automatic' });
    return { ok: true };
  } catch (e) {
    const msg = e.message;
    const m = msg.match(/:(\d+):(\d+)/);
    return { ok: false, line: m ? parseInt(m[1]) : -1, col: m ? parseInt(m[2]) : -1, snippet: msg.split('\n').slice(0,3).join(' | ') };
  }
}

// Test 1: Original file
console.log('=== Test 1: Original file ===');
const r1 = testContent(content, 'original');
console.log(JSON.stringify(r1));

// Find all render function boundaries
const renderFuncs = [];
for (let i = 0; i < lines.length; i++) {
  const match = lines[i].match(/^\s*const (render\w+)\s*=\s*(\(\)\s*=>\s*\(|(\(\)\s*=>\s*\{|function\s))/);
  if (match) {
    const name = match[1];
    const startLine = i;
    // Find the end: look for the pattern "const render" or the main return, or end of function
    // Simple approach: find matching closing pattern
    let depth = 0;
    let endLine = -1;
    // Count parens and braces from startLine
    for (let j = i; j < lines.length; j++) {
      const line = lines[j];
      for (const ch of line) {
        if (ch === '(' || ch === '{' || ch === '[') depth++;
        if (ch === ')' || ch === '}' || ch === ']') depth--;
      }
      if (depth <= 0 && j > i) {
        endLine = j;
        break;
      }
    }
    if (endLine === -1) endLine = lines.length - 1;
    renderFuncs.push({ name, startLine: i, endLine });
    console.log(`Found ${name}: lines ${i+1}-${endLine+1}`);
  }
}

// Test 2: Replace all render functions with stubs
let modified = [...lines];
const stubs = renderFuncs.reverse(); // reverse so line numbers stay valid
for (const fn of stubs) {
  const stub = `const ${fn.name} = () => null;`;
  modified.splice(fn.startLine, fn.endLine - fn.startLine + 1, stub);
}

console.log('\n=== Test 2: All render functions stubbed ===');
const r2 = testContent(modified.join('\n'), 'all-stubbed');
console.log(JSON.stringify(r2));

// Test 3: Replace renderCalculadora only
const calcFunc = renderFuncs.find(f => f.name === 'renderCalculadora');
if (calcFunc) {
  const mod3 = [...lines];
  const calcFn = renderFuncs.find(f => f.name === 'renderCalculadora');
  mod3.splice(calcFn.startLine, calcFn.endLine - calcFn.startLine + 1, 'const renderCalculadora = () => null;');
  console.log('\n=== Test 3: renderCalculadora stubbed ===');
  const r3 = testContent(mod3.join('\n'), 'calc-stubbed');
  console.log(JSON.stringify(r3));
}
