const fs = require('fs');
process.env.NODE_PATH = 'C:\\Users\\Renato\\AppData\\Local\\npm-cache\\_npx\\beb367dfa21eb3f5\\node_modules';
require('module').Module._initPaths();
const { buildSync } = require('esbuild');

const filePath = 'C:\\Users\\Renato\\OneDrive\\Desktop\\nexlog\\src\\app\\page.tsx';
const lines = fs.readFileSync(filePath, 'utf8').split('\n');
const total = lines.length;

function testChunk(start, end) {
  // Take lines start..end (1-indexed), wrap in a minimal TSX file
  const chunk = lines.slice(start - 1, end).join('\n');
  const testFile = `C:\\Users\\Renato\\AppData\\Local\\Temp\\test-chunk.tsx`;
  const preamble = `
import React, { useState, useEffect, useCallback, useRef } from 'react';
`;
  fs.writeFileSync(testFile, preamble + chunk);
  try {
    buildSync({ entryPoints: [testFile], bundle: false, write: false, logLevel: 'silent', jsx: 'automatic' });
    return true;
  } catch (e) {
    const msg = e.message;
    // Extract line:col from esbuild error
    const m = msg.match(/:(\d+):(\d+)/);
    return { error: true, relLine: m ? parseInt(m[1]) : -1, col: m ? parseInt(m[2]) : -1, snippet: msg.split('\n').slice(0,3).join(' | ') };
  }
}

// Step 1: Test entire file
console.log(`Total lines: ${total}`);
const fullResult = testChunk(1, total);
if (fullResult === true) {
  console.log('FULL FILE: OK');
  process.exit(0);
}
console.log(`FULL FILE ERROR: line ${fullResult.relLine}, col ${fullResult.col}`);
console.log(`  ${fullResult.snippet}`);

// Step 2: Binary search - split in half
function binarySearch(start, end, depth) {
  if (depth > 10 || end - start < 10) {
    console.log(`\nAROUND LINE ${start}-${end}:`);
    for (let i = start; i <= Math.min(end, start + 5); i++) {
      console.log(`  ${i}: ${lines[i-1].substring(0, 100)}`);
    }
    return;
  }
  const mid = Math.floor((start + end) / 2);
  // Test first half - need to close any open JSX
  const firstHalf = lines.slice(start - 1, mid).join('\n');
  const testFile1 = `C:\\Users\\Renato\\AppData\\Local\\Temp\\test-half1.tsx`;
  const testFile2 = `C:\\Users\\Renato\\AppData\\Local\\Temp\\test-half2.tsx`;
  
  // For first half, just test as-is (even if incomplete, we want to see if parse error is there)
  const preamble = `import React from 'react';\n`;
  
  // Test first half
  fs.writeFileSync(testFile1, preamble + firstHalf);
  try {
    buildSync({ entryPoints: [testFile1], bundle: false, write: false, logLevel: 'silent', jsx: 'automatic' });
    console.log(`FIRST HALF (${start}-${mid}): OK`);
  } catch (e) {
    const msg = e.message;
    const m = msg.match(/:(\d+):(\d+)/);
    const errLine = m ? parseInt(m[1]) : -1;
    console.log(`FIRST HALF (${start}-${mid}): ERROR at local line ${errLine} (absolute ~${start + errLine - 2})`);
    // Binary search deeper into first half
    binarySearch(start, mid, depth + 1);
  }
  
  // Test second half
  const secondHalf = lines.slice(mid, end).join('\n');
  fs.writeFileSync(testFile2, preamble + secondHalf);
  try {
    buildSync({ entryPoints: [testFile2], bundle: false, write: false, logLevel: 'silent', jsx: 'automatic' });
    console.log(`SECOND HALF (${mid+1}-${end}): OK`);
  } catch (e) {
    const msg = e.message;
    const m = msg.match(/:(\d+):(\d+)/);
    const errLine = m ? parseInt(m[1]) : -1;
    console.log(`SECOND HALF (${mid+1}-${end}): ERROR at local line ${errLine} (absolute ~${mid + errLine})`);
    binarySearch(mid + 1, end, depth + 1);
  }
}

binarySearch(1, total, 0);
