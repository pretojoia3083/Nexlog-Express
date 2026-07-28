const fs = require('fs');
const src = fs.readFileSync('src/app/page.tsx', 'utf8');
const lines = src.split('\n');

let globalDepth = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  let inSingle = false, inDouble = false, inTemplate = false;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;
  
  for (let j = 0; j < line.length; j++) {
    const ch = line[j];
    const next = j + 1 < line.length ? line[j+1] : '';
    
    if (inBlockComment) {
      if (ch === '*' && next === '/') { inBlockComment = false; j++; }
      continue;
    }
    if (inLineComment) continue;
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === "'" && !inDouble && !inTemplate) { inSingle = !inSingle; continue; }
    if (ch === '"' && !inSingle && !inTemplate) { inDouble = !inDouble; continue; }
    if (ch === '`' && !inSingle && !inDouble) { inTemplate = !inTemplate; continue; }
    if (inSingle || inDouble || inTemplate) continue;
    if (ch === '/' && next === '/') { inLineComment = true; continue; }
    if (ch === '/' && next === '*') { inBlockComment = true; j++; continue; }
    
    if (ch === '{') globalDepth++;
    if (ch === '}') globalDepth--;
  }
  
  inLineComment = false;
  
  // Show every line where depth changes (only for key areas)
  // Print depth at end of lines that are 0 or when near transitions
  if (globalDepth === 0 && i > 0) {
    console.log(`Line ${i+1}: depth=0 : ${line.trim().substring(0, 60)}`);
  }
}

console.log(`\nFinal depth: ${globalDepth}`);

// Now find: which function/section leaves the depth at 1?
// Reset and check by section
globalDepth = 0;
console.log('\n--- Depth at end of each function ---');
let funcStart = -1;
let funcName = '';
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  let inSingle = false, inDouble = false, inTemplate = false;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;
  
  for (let j = 0; j < line.length; j++) {
    const ch = line[j];
    const next = j + 1 < line.length ? line[j+1] : '';
    
    if (inBlockComment) {
      if (ch === '*' && next === '/') { inBlockComment = false; j++; }
      continue;
    }
    if (inLineComment) continue;
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === "'" && !inDouble && !inTemplate) { inSingle = !inSingle; continue; }
    if (ch === '"' && !inSingle && !inTemplate) { inDouble = !inDouble; continue; }
    if (ch === '`' && !inSingle && !inDouble) { inTemplate = !inTemplate; continue; }
    if (inSingle || inDouble || inTemplate) continue;
    if (ch === '/' && next === '/') { inLineComment = true; continue; }
    if (ch === '/' && next === '*') { inBlockComment = true; j++; continue; }
    
    if (ch === '{') globalDepth++;
    if (ch === '}') globalDepth--;
  }
  inLineComment = false;
  
  // Track function starts and their brace depth
  if (line.match(/const (render\w+|calculate\w+|open\w+|close\w+|delete\w+|save\w+|add\w+|remove\w+|update\w+|share\w+)\s*[=(]/) && globalDepth >= 1) {
    funcName = line.match(/const (\w+)/)[1];
    funcStart = i + 1;
  }
  
  if (funcStart > 0 && globalDepth === 1 && line.trim() === '};') {
    console.log(`${funcName} (line ${funcStart}): ends at line ${i+1}, depth=${globalDepth}`);
    funcStart = -1;
  }
}
