const fs = require('fs');
process.env.NODE_PATH = 'C:\\Users\\Renato\\AppData\\Local\\npm-cache\\_npx\\beb367dfa21eb3f5\\node_modules';
require('module').Module._initPaths();
const { buildSync } = require('esbuild');

const filePath = 'C:\\Users\\Renato\\OneDrive\\Desktop\\nexlog\\src\\app\\page.tsx';
const lines = fs.readFileSync(filePath, 'utf8').split('\n');
const preamble = `import React, { useState, useEffect, useRef } from 'react';\n`;
const testFile = 'C:\\Users\\Renato\\AppData\\Local\\Temp\\test-segment.tsx';

// renderCalculadora spans lines 783-902 (0-indexed: 782-901)
// Strategy: keep everything except renderCalculadora, insert a stub.
// Then replace a chunk of lines 783-902 with test content and see if it compiles.

const calcStart = 782; // 0-indexed
const calcEnd = 901;   // 0-indexed (inclusive)
const calcLines = lines.slice(calcStart, calcEnd + 1);

function buildTest(modified) {
  const code = modified.join('\n');
  fs.writeFileSync(testFile, preamble + code);
  try {
    buildSync({ entryPoints: [testFile], bundle: false, write: false, logLevel: 'silent', jsx: 'automatic' });
    return true;
  } catch (e) {
    const msg = e.message;
    const m = msg.match(/:(\d+):(\d+)/);
    // The line number is relative to the test file, so subtract preamble lines (1)
    return false;
  }
}

// We know the full file with calc stubbed works. 
// Now test: keep everything, but replace renderCalculadora body with stub + a test chunk.

// Approach: take first N lines of renderCalculadora + stub the rest
for (let chunkEnd = 1; chunkEnd <= calcLines.length; chunkEnd++) {
  const testCalc = calcLines.slice(0, chunkEnd).join('\n');
  // Close the function properly
  const stubSuffix = '\n  );\n';
  
  const modified = [
    ...lines.slice(0, calcStart),
    testCalc + stubSuffix,
    ...lines.slice(calcEnd + 1)
  ].join('\n');
  
  if (!buildTest(modified)) {
    // Found the first line that causes error
    console.log(`Error when including lines ${calcStart+1}-${calcStart+chunkEnd}`);
    console.log(`Last line included: ${calcStart+chunkEnd}: ${calcLines[chunkEnd-1]}`);
    console.log(`Prev line: ${calcStart+chunkEnd-1}: ${calcLines[chunkEnd-2] || '(start)'}`);
    break;
  }
}
console.log('Done scanning');
