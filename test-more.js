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
    const m = e.message.match(/ERROR: (.+)/);
    return { error: m ? m[1] : e.message };
  }
}

// First: revert to original by re-reading. We know original has 1326 lines, error at 902.
console.log('Current file lines:', lines.length);

// Test: What if I replace JUST line 829 (the very long input) with a short one?
// And also add <div> wrapper for lines 828-829
console.log('\nTest L: Replace ONLY 828-830 with wrapper div + original label + simplified input');
const rL = tryReplace(828, 830, [
  '              <div>',
  '                <label style={{ display: "block", fontSize: 12, color: "#8A7AA8", marginBottom: 6 }}>Valor por KM (R$)</label>',
  '                <input type="number" value={calcValorKm} onChange={(e) => setCalcValorKm(e.target.value)} step="0.1" min="0" />',
  '              </div>',
].join('\n'));

function tryReplace(startLine1, endLine1, replacement) {
  const mod = [...lines];
  mod.splice(startLine1 - 1, endLine1 - startLine1 + 1, replacement);
  return buildTest(preamble + mod.join('\n'));
}

console.log('  Result:', rL);

// Test M: What if I just wrap 828-829 in <div> without removing the old </div>?
console.log('\nTest M: Replace 828-829 only (keep 830)');
const rM = tryReplace(828, 829, [
  '              <div>',
  '                <label style={{ display: "block", fontSize: 12, color: "#8A7AA8", marginBottom: 6 }}>Valor por KM (R$)</label>',
  '                <input type="number" value={calcValorKm} onChange={(e) => setCalcValorKm(e.target.value)} step="0.1" min="0" />',
  '              </div>',
].join('\n'));
console.log('  Result:', rM);

// Test N: What if the issue is something AFTER the function? Try stubbing everything after renderCalculadora
console.log('\nTest N: Stub renderClientes onwards');
// Find renderClientes
const calcEnd = 902; // line 902 = ");"
const rN = buildTest(preamble + [
  ...lines.slice(0, calcEnd + 1),
  '\n  const renderClientes = () => null;',
  '\n  const renderHistorico = () => null;',
  '\n  const renderPedagios = () => null;',
  '\n  const renderTollModal = () => null;',
  '\n  const renderClientModal = () => null;',
  '\n  const renderBudgetModal = () => null;',
  '\n  const [current, setCurrent] = React.useState("dashboard");',
  '\n  return <div>{current === "dashboard" && renderDashboard()}{current === "roteirizador" && renderRoteirizador()}{current === "calculadora" && renderCalculadora()}</div>;',
  '\n}',
].join('\n'));
console.log('  Result:', rN);
