const fs = require('fs');
process.env.NODE_PATH = 'C:\\Users\\Renato\\AppData\\Local\\npm-cache\\_npx\\beb367dfa21eb3f5\\node_modules';
require('module').Module._initPaths();
const { buildSync } = require('esbuild');

const filePath = 'C:\\Users\\Renato\\OneDrive\\Desktop\\nexlog\\src\\app\\page.tsx';
const lines = fs.readFileSync(filePath, 'utf8').split('\n');
const preamble = `import React, { useState, useEffect, useRef } from 'react';\n`;
const testFile = 'C:\\Users\\Renato\\AppData\\Local\\Temp\\test-segment.tsx';

const calcStart = 782; // 0-indexed line 783
const calcEnd = 901;   // 0-indexed line 902

function buildTest(code) {
  fs.writeFileSync(testFile, code);
  try {
    buildSync({ entryPoints: [testFile], bundle: false, write: false, logLevel: 'silent', jsx: 'automatic' });
    return true;
  } catch (e) {
    return false;
  }
}

// Strategy: Start with stubbed renderCalculadora. 
// Restore chunks of lines from the original until error reappears.
const stubCalc = [
  '  const renderCalculadora = () => (',
  '    <div>',
  '      <div>stub</div>',
  '    </div>',
  '  );'
];

const calcBody = lines.slice(calcStart + 1, calcEnd); // Lines inside the function (784-901)
// The function wrapper is: line 783 = "const renderCalculadora = () => ("
//                         line 902 = "  );"
// Lines 784-901 are the JSX body

console.log(`Calc body: ${calcBody.length} lines (784-901)`);

function buildWithCalcBody(bodyLines) {
  const calcCode = [
    '  const renderCalculadora = () => (',
    ...bodyLines,
    '  );'
  ].join('\n');
  
  const fullCode = [
    ...lines.slice(0, calcStart),
    calcCode,
    ...lines.slice(calcEnd + 1)
  ].join('\n');
  
  return buildTest(preamble + fullCode);
}

// Binary search: try restoring first half of body
function binarySearch(bodyStart, bodyEnd, depth) {
  // bodyStart/bodyEnd are indices into calcBody (0-indexed)
  if (depth > 10 || bodyEnd - bodyStart < 2) {
    console.log(`\nNarrowed to calcBody lines ${bodyStart}-${bodyEnd} (absolute lines ${calcStart+2+bodyStart}-${calcStart+2+bodyEnd}):`);
    for (let i = bodyStart; i <= Math.min(bodyEnd, bodyStart + 5); i++) {
      console.log(`  ${calcStart+2+i}: ${calcBody[i].substring(0, 120)}`);
    }
    return;
  }
  
  const mid = Math.floor((bodyStart + bodyEnd) / 2);
  
  // Test: stub everything, restore first half
  const testBody1 = [
    ...calcBody.slice(bodyStart, mid + 1),
    '/* stub */ <div>rest stubbed</div>'
  ];
  
  // Test: stub everything, restore second half
  const testBody2 = [
    '/* stub */ <div>first stubbed</div>',
    ...calcBody.slice(mid + 1, bodyEnd + 1)
  ];
  
  const r1 = buildWithCalcBody(testBody1);
  const r2 = buildWithCalcBody(testBody2);
  
  if (!r1) {
    console.log(`ERROR with first half restored (${bodyStart}-${mid})`);
    binarySearch(bodyStart, mid, depth + 1);
  } else {
    console.log(`OK with first half restored (${bodyStart}-${mid})`);
  }
  
  if (!r2) {
    console.log(`ERROR with second half restored (${mid+1}-${bodyEnd})`);
    binarySearch(mid + 1, bodyEnd, depth + 1);
  } else {
    console.log(`OK with second half restored (${mid+1}-${bodyEnd})`);
  }
}

binarySearch(0, calcBody.length - 1, 0);
