const fs = require('fs');
process.env.NODE_PATH = 'C:\\Users\\Renato\\AppData\\Local\\npm-cache\\_npx\\beb367dfa21eb3f5\\node_modules';
require('module').Module._initPaths();
const { buildSync } = require('esbuild');

const filePath = 'C:\\Users\\Renato\\OneDrive\\Desktop\\nexlog\\src\\app\\page.tsx';
const content = fs.readFileSync(filePath, 'utf8');
const testFile = 'C:\\Users\\Renato\\AppData\\Local\\Temp\\test-full.tsx';
const preamble = `import React, { useState, useEffect, useRef } from 'react';\n`;
fs.writeFileSync(testFile, preamble + content);
try {
  buildSync({ entryPoints: [testFile], bundle: false, write: false, logLevel: 'silent', jsx: 'automatic' });
  console.log('BUILD SUCCESS!');
} catch (e) {
  console.log('BUILD FAILED');
  console.log(e.message);
}
