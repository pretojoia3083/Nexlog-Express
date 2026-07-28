const fs = require('fs');
process.env.NODE_PATH = 'C:\\Users\\Renato\\AppData\\Local\\npm-cache\\_npx\\beb367dfa21eb3f5\\node_modules';
require('module').Module._initPaths();
const { buildSync } = require('esbuild');

const filePath = 'C:\\Users\\Renato\\OneDrive\\Desktop\\nexlog\\src\\app\\page.tsx';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');
const preamble = `import React, { useState, useEffect, useRef } from 'react';\n`;
const testFile = 'C:\\Users\\Renato\\AppData\\Local\\Temp\\test-full.tsx';

// Verify we're at 1326 lines
console.log('Lines:', lines.length);

// Test: replace 828-830 with EXACT Test G replacement
function tryReplace(startLine1, endLine1, replacement) {
  const mod = [...lines];
  mod.splice(startLine1 - 1, endLine1 - startLine1 + 1, replacement);
  const code = preamble + mod.join('\n');
  fs.writeFileSync(testFile, code);
  try {
    buildSync({ entryPoints: [testFile], bundle: false, write: false, logLevel: 'silent', jsx: 'automatic' });
    console.log(`  SUCCESS (splice ${startLine1}-${endLine1})`);
    // Write the successful version
    fs.writeFileSync(filePath, mod.join('\n'));
    return true;
  } catch (e) {
    const m = e.message.match(/ERROR: (.+)/);
    console.log(`  FAIL (splice ${startLine1}-${endLine1}): ${m ? m[1] : e.message}`);
    return false;
  }
}

// Test A: Exact Test G replacement (replace 828-830)
console.log('Test A: Replace 828-830 with wrapper div');
const rA = tryReplace(828, 830, [
  '              <div>',
  '                <label style={{ display: "block", fontSize: 12, color: "#8A7AA8", marginBottom: 6 }}>Valor por KM (R$)</label>',
  '                <input type="number" />',
  '              </div>',
].join('\n'));
