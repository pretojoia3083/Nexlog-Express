const fs = require('fs');
process.env.NODE_PATH = 'C:\\Users\\Renato\\AppData\\Local\\npm-cache\\_npx\\beb367dfa21eb3f5\\node_modules';
require('module').Module._initPaths();
const { buildSync } = require('esbuild');

const filePath = 'C:\\Users\\Renato\\OneDrive\\Desktop\\nexlog\\src\\app\\page.tsx';
const lines = fs.readFileSync(filePath, 'utf8').split('\n');
const preamble = `import React, { useState, useEffect, useRef } from 'react';\n`;
const testFile = 'C:\\Users\\Renato\\AppData\\Local\\Temp\\test-segment.tsx';

// renderCalculadora = lines 783-902 (1-indexed)
// We'll try replacing JUST the result display part (lines 852-899, the right panel)
// with a simple stub, and see if the error goes away.

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

// Test: Replace the right panel (lines 852-899) with a simple div
console.log('Test A: Replace right panel (852-899)');
const rA = tryReplace(852, 899, '        <div>RESULT STUB</div>');
console.log('  Result:', rA);

// Test: Replace just the ternary (lines 854-898) with a simple div
console.log('Test B: Replace ternary (854-898)');
const rB = tryReplace(854, 898, '          <div>RESULT STUB</div>');
console.log('  Result:', rB);

// Test: Replace just the km > 0 block (lines 865-892)
console.log('Test C: Replace km>0 block (865-892)');
const rC = tryReplace(865, 892, '              {null}');
console.log('  Result:', rC);

// Test: Replace just the button (lines 893-896) 
console.log('Test D: Replace button (893-896)');
const rD = tryReplace(893, 896, '              {null}');
console.log('  Result:', rD);

// Test: Replace the input section (lines 788-850, the left panel)
console.log('Test E: Replace left panel (788-850)');
const rE = tryReplace(788, 850, '        <div>INPUT STUB</div>');
console.log('  Result:', rE);

// Test: Replace lines 821-850 (Dados do Frete section)
console.log('Test F: Replace Dados do Frete (821-850)');
const rF = tryReplace(821, 850, '            <div>FORM STUB</div>');
console.log('  Result:', rF);

// Test: Replace lines 828-830 (missing div wrapper issue)
console.log('Test G: Replace lines 828-830');
const rG = tryReplace(828, 830, '              <div>\n                <label style={{ display: "block", fontSize: 12, color: "#8A7AA8", marginBottom: 6 }}>Valor por KM (R$)</label>\n                <input type="number" />\n              </div>');
console.log('  Result:', rG);
