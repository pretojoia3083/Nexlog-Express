const fs = require('fs');
const src = fs.readFileSync('src/app/page.tsx', 'utf8');
const lines = src.split('\n');

// Track actual JS/JSX brace depth (skipping strings and template literals)
let globalDepth = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  let lineDepth = 0;
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
    if (inLineComment) {
      continue;
    }
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === "'" && !inDouble && !inTemplate) { inSingle = !inSingle; continue; }
    if (ch === '"' && !inSingle && !inTemplate) { inDouble = !inDouble; continue; }
    if (ch === '`' && !inSingle && !inDouble) { inTemplate = !inTemplate; continue; }
    
    if (inSingle || inDouble || inTemplate) continue;
    
    if (ch === '/' && next === '/') { inLineComment = true; continue; }
    if (ch === '/' && next === '*') { inBlockComment = true; j++; continue; }
    
    if (ch === '{') { lineDepth++; globalDepth++; }
    if (ch === '}') { lineDepth--; globalDepth--; }
  }
  
  if (inLineComment) inLineComment = false;
  
  // Track where template literals with ${} might cause issues
  // Show lines around renderCalculadora where brace depth changes
  if (i >= 630 && i <= 650) {
    if (lineDepth !== 0) {
      console.log(`Line ${i+1}: depth change ${lineDepth > 0 ? '+' : ''}${lineDepth} (global: ${globalDepth}) : ${line.trim().substring(0, 80)}`);
    }
  }
  if (i >= 780 && i <= 910) {
    if (lineDepth !== 0) {
      console.log(`Line ${i+1}: depth change ${lineDepth > 0 ? '+' : ''}${lineDepth} (global: ${globalDepth}) : ${line.trim().substring(0, 80)}`);
    }
  }
}

console.log(`\nFinal global brace depth: ${globalDepth}`);

// Now check: are there template literals with ${} inside renderCalculadora?
console.log('\n--- Checking for template literals in renderCalculadora ---');
for (let i = 782; i < 902; i++) {
  if (lines[i].includes('`') && lines[i].includes('${')) {
    console.log(`Line ${i+1}: ${lines[i].trim().substring(0, 100)}`);
  }
}

// Check for regex patterns
console.log('\n--- Checking for regex in renderCalculadora ---');
for (let i = 782; i < 902; i++) {
  // Look for / that's NOT part of //, />  , </, or inside strings
  const line = lines[i];
  let inStr = false;
  let strChar = '';
  for (let j = 0; j < line.length; j++) {
    const ch = line[j];
    const next = j + 1 < line.length ? line[j+1] : '';
    if (inStr) {
      if (ch === '\\') { j++; continue; }
      if (ch === strChar) inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = true; strChar = ch; continue; }
    if (ch === '/' && next === '/') break; // rest is comment
    if (ch === '/' && next !== '/' && next !== '*' && next !== '>') {
      // This / is not //, not /*, not />
      // Check what comes before
      const before = j > 0 ? line[j-1] : '';
      if (before === '=' || before === ':' || before === '(' || before === '[' || before === '!' || before === '&' || before === '|' || before === '?' || before === ',' || before === ';' || before === '{' || before === '\n' || before === ' ' || before === '\t') {
        // Potential regex start!
        console.log(`Line ${i+1} col ${j+1}: potential regex /: before='${before}' rest=${line.substring(j, Math.min(j+20, line.length))}`);
      }
    }
  }
}
