const fs = require('fs');
const src = fs.readFileSync('src/app/page.tsx', 'utf8');
const lines = src.split('\n');

let depth = 0;
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
    
    if (ch === '{') depth++;
    if (ch === '}') depth--;
  }
  inLineComment = false;
  
  // Show depth at every line from 260 onwards, but only when depth changes or is 0
  if (i >= 260 && i <= 310) {
    if (i === 260 || depth <= 1) {
      console.log(`Line ${i+1}: depth=${depth} : ${line.trim().substring(0, 80)}`);
    }
  }
}

console.log(`\nFinal depth: ${depth}`);
