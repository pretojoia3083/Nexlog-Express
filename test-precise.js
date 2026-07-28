const fs = require('fs');
process.env.NODE_PATH = 'C:\\Users\\Renato\\AppData\\Local\\npm-cache\\_npx\\beb367dfa21eb3f5\\node_modules';
require('module').Module._initPaths();
const { buildSync } = require('esbuild');

const filePath = 'C:\\Users\\Renato\\OneDrive\\Desktop\\nexlog\\src\\app\\page.tsx';
const lines = fs.readFileSync(filePath, 'utf8').split('\n');
const preamble = `import React, { useState, useEffect, useRef } from 'react';\n`;
const testFile = 'C:\\Users\\Renato\\AppData\\Local\\Temp\\test-full.tsx';

function buildTest(code) {
  fs.writeFileSync(testFile, code);
  try {
    buildSync({ entryPoints: [testFile], bundle: false, write: false, logLevel: 'silent', jsx: 'automatic' });
    return true;
  } catch (e) {
    return false;
  }
}

function tryReplace(startLine1, endLine1, replacement) {
  const mod = [...lines];
  mod.splice(startLine1 - 1, endLine1 - startLine1 + 1, replacement);
  return buildTest(preamble + mod.join('\n'));
}

// Test H: Replace 828-830 with div wrapper but KEEP full original input
console.log('Test H: Add <div> wrapper, keep full original input');
const rH = tryReplace(828, 830, [
  '              <div>',
  lines[827], // original line 828 (label)
  lines[828], // original line 829 (input with full props)
  '              </div>',
].join('\n'));
console.log('  Result:', rH);

// Test I: Replace just 828-829 (label + input) without wrapper, keeping original 830
console.log('Test I: Keep original 828-830 unchanged');
// This should be same as original = false
const rI = tryReplace(828, 830, [lines[827], lines[828], lines[829]].join('\n'));
console.log('  Result:', rI);

// Test J: Replace 828-830, wrap in div, but use simple input
console.log('Test J: Add <div> wrapper, simplified input');
const rJ = tryReplace(828, 830, [
  '              <div>',
  '                <label style={{ display: "block", fontSize: 12, color: "#8A7AA8", marginBottom: 6 }}>Valor por KM (R$)</label>',
  '                <input type="number" value={calcValorKm} onChange={(e) => setCalcValorKm(e.target.value)} step="0.1" min="0" style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #251540", backgroundColor: "#15092E", color: "#E8ECF0", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />',
  '              </div>',
].join('\n'));
console.log('  Result:', rJ);

// Test K: Replace 828-830, just add <div> before 828 and </div> after 830 (restructure)
// Need to also add </div> for the grid that's now unclosed
console.log('Test K: Wrap label+input in div, keep closing structure');
const rK = tryReplace(827, 831, [
  '              </div>',
  '              <div>',
  '                <label style={{ display: "block", fontSize: 12, color: "#8A7AA8", marginBottom: 6 }}>Valor por KM (R$)</label>',
  '                <input type="number" value={calcValorKm} onChange={(e) => setCalcValorKm(e.target.value)} step="0.1" min="0" style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #251540", backgroundColor: "#15092E", color: "#E8ECF0", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />',
  '              </div>',
  '            </div>',
  '            </div>',
].join('\n'));
console.log('  Result:', rK);
