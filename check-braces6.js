const fs = require('fs');
const src = require('fs').readFileSync('src/app/page.tsx', 'utf8');
const lines = src.split('\n');

let depth = 0;
let templateDepth = 0; // Track depth inside template literals with ${}
let inTemplate = false;
let inTemplateExpr = false;
let exprDepth = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  let inSingle = false, inDouble = false;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;
  
  let lineChanged = false;
  
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
    
    // Handle template literal expression mode
    if (inTemplateExpr) {
      if (ch === '{') { exprDepth++; depth++; lineChanged = true; }
      else if (ch === '}') { 
        exprDepth--; depth--;
        lineChanged = true;
        if (exprDepth === 0) inTemplateExpr = false; // Back in template literal text
      }
      continue;
    }
    
    if (inTemplate) {
      if (ch === '$' && next === '{') { 
        inTemplateExpr = true;
        exprDepth = 1;
        depth++; // Opening ${ counts as {
        lineChanged = true;
        j++; // Skip {
        continue;
      }
      if (ch === '`') { inTemplate = false; }
      continue;
    }
    
    if (ch === "'" && !inDouble) { inSingle = !inSingle; continue; }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; continue; }
    if (ch === '`' && !inSingle && !inDouble) { inTemplate = true; continue; }
    
    if (inSingle || inDouble) continue;
    if (ch === '/' && next === '/') { inLineComment = true; continue; }
    if (ch === '/' && next === '*') { inBlockComment = true; j++; continue; }
    
    if (ch === '{') { depth++; lineChanged = true; }
    if (ch === '}') { depth--; lineChanged = true; }
  }
  inLineComment = false;
  
  if (lineChanged || i === lines.length - 1) {
    // Only show when depth is at critical levels or changes significantly
    if (depth <= 2 || i >= 263) {
      if (depth <= 1 && i >= 263) {
        console.log(`Line ${i+1}: depth=${depth} : ${line.trim().substring(0, 80)}`);
      }
    }
  }
}
console.log(`\nFinal depth: ${depth}`);
