const fs = require('fs');
process.env.NODE_PATH = 'C:\\Users\\Renato\\AppData\\Local\\npm-cache\\_npx\\beb367dfa21eb3f5\\node_modules';
require('module').Module._initPaths();
const { buildSync } = require('esbuild');

const filePath = 'C:\\Users\\Renato\\OneDrive\\Desktop\\nexlog\\src\\app\\page.tsx';
const lines = fs.readFileSync(filePath, 'utf8').split('\n');
const preamble = `import React, { useState, useEffect, useRef } from 'react';\n`;
const testFile = 'C:\\Users\\Renato\\AppData\\Local\\Temp\\test-segment.tsx';

// renderCalculadora = lines 783-902 (1-indexed) = 782-901 (0-indexed)
const calcStart = 782; // 0-indexed, line 783
const calcEnd = 901;   // 0-indexed, line 902

function buildTest(code) {
  fs.writeFileSync(testFile, code);
  try {
    buildSync({ entryPoints: [testFile], bundle: false, write: false, logLevel: 'silent', jsx: 'automatic' });
    return true;
  } catch (e) {
    return false;
  }
}

function replaceLines(modLines, start, end, replacement) {
  const copy = [...modLines];
  copy.splice(start, end - start + 1, replacement);
  return copy;
}

// Replace a section of renderCalculadora with a placeholder div
function testCalcSection(startLine, endLine) {
  // Keep the function wrapper, but replace the body section with a placeholder
  const originalCalc = lines.slice(calcStart, calcEnd + 1);
  const modifiedCalc = [...originalCalc];
  
  // Calculate relative positions (0-indexed within the calc function)
  const relStart = startLine - calcStart;
  const relEnd = endLine - calcStart;
  
  // Replace those lines with a placeholder comment
  modifiedCalc.splice(relStart, relEnd - relStart + 1, '/* replaced */');
  
  const newCalc = modifiedCalc.join('\n');
  const fullCode = [
    ...lines.slice(0, calcStart),
    newCalc,
    ...lines.slice(calcEnd + 1)
  ].join('\n');
  
  return buildTest(preamble + fullCode);
}

// Binary search: test first half, then second half
function binarySearch(start, end, depth) {
  if (depth > 8) {
    console.log(`Lines ${start+1}-${end+1}: potential error area`);
    // Print the lines
    for (let i = start; i <= Math.min(end, start + 3); i++) {
      console.log(`  ${i+1}: ${lines[i].substring(0, 120)}`);
    }
    return;
  }
  
  const mid = Math.floor((start + end) / 2);
  
  // Test: replace first half with comment
  if (testCalcSection(start, mid)) {
    console.log(`First half (${start+1}-${mid+1}) is NOT the problem`);
  } else {
    console.log(`First half (${start+1}-${mid+1}) IS the problem`);
    binarySearch(start, mid, depth + 1);
  }
  
  // Test: replace second half with comment
  if (testCalcSection(mid + 1, end)) {
    console.log(`Second half (${mid+2}-${end+1}) is NOT the problem`);
  } else {
    console.log(`Second half (${mid+2}-${end+1}) IS the problem`);
    binarySearch(mid + 1, end, depth + 1);
  }
}

console.log(`Searching renderCalculadora lines ${calcStart+1}-${calcEnd+1}`);
binarySearch(calcStart, calcEnd, 0);
