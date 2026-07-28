const fs = require('fs');
const src = fs.readFileSync('src/app/page.tsx', 'utf8');
const lines = src.split('\n');

let depth = 0;
let prevDepth = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  let inSingle = false, inDouble = false, inTemplate = false;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;
  
  prevDepth = depth;
  
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
  
  // Show lines where depth goes above expected levels inside the function
  // The function opens at line 264 (depth 1). Any depth > 2 means nested {}.
  // Show when depth reaches a new max or drops
  if (i >= 263 && i <= 1326) {
    if (depth > prevDepth && depth >= 2) {
      console.log(`Line ${i+1}: OPEN  depth ${prevDepth} -> ${depth} : ${line.trim().substring(0, 80)}`);
    }
    if (depth < prevDepth && prevDepth >= 2) {
      console.log(`Line ${i+1}: CLOSE depth ${prevDepth} -> ${depth} : ${line.trim().substring(0, 80)}`);
    }
  }
}
console.log(`\nFinal depth: ${depth}`);
