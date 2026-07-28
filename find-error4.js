const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const file = fs.readFileSync('src/app/page.tsx', 'utf8');
const lines = file.split('\n');

function testContent(content, label) {
  const tmpFile = path.join(process.cwd(), '_test_rep.tsx');
  fs.writeFileSync(tmpFile, content);
  try {
    execSync(`npx esbuild _test_rep.tsx --jsx=automatic --loader:.tsx=tsx --outfile=/dev/null 2>nul`, { encoding: 'utf8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] });
    return true;
  } catch (e) {
    const stderr = e.stderr || '';
    const errMsg = stderr.split('\n').filter(l => l.includes('X [ERROR]') || l.includes('error')).join(' | ');
    return errMsg || 'parse failed';
  } finally {
    try { fs.unlinkSync(tmpFile); } catch(ex) {}
  }
}

// First, let's check what the actual error line number is in the full file
console.log('Full file error:');
const fullResult = testContent(file, 'full');
console.log(`  ${fullResult}`);

// Now replace all render functions with stubs
// Lines 1-639: before render functions
// Lines 640-1223: render functions  
// Lines 1224-end: after render functions (return statement etc)
const beforeRender = lines.slice(0, 639).join('\n');
const afterRender = lines.slice(1223).join('\n');

// Create stub functions
const stubs = `
  const renderDashboard = () => <div>dashboard</div>;
  const renderRoteirizador = () => <div>roteirizador</div>;
  const renderCalculadora = () => <div>calculadora</div>;
  const renderClientes = () => <div>clientes</div>;
  const renderHistorico = () => <div>historico</div>;
  const renderPedagios = () => <div>pedagios</div>;
  const renderTollModal = () => <div>toll</div>;
  const renderClientModal = () => <div>client</div>;
  const renderBudgetModal = () => <div>budget</div>;
`;

const noFns = beforeRender + stubs + afterRender;
console.log('\nAll render functions stubbed:');
const stubResult = testContent(noFns, 'stubs');
console.log(`  ${stubResult}`);

// If stubs fix it, test individual functions
if (stubResult === true) {
  // Find which function when UN-stubbed breaks it
  const renderFnRanges = [
    { name: 'renderDashboard', start: 640, end: 687 },
    { name: 'renderRoteirizador', start: 689, end: 781 },
    { name: 'renderCalculadora', start: 783, end: 902 },
    { name: 'renderClientes', start: 904, end: 959 },
    { name: 'renderHistorico', start: 961, end: 999 },
    { name: 'renderPedagios', start: 1001, end: 1069 },
    { name: 'renderTollModal', start: 1071, end: 1106 },
    { name: 'renderClientModal', start: 1108, end: 1146 },
    { name: 'renderBudgetModal', start: 1148, end: 1223 },
  ];
  
  // Test each function individually added back
  for (const fn of renderFnRanges) {
    const origFn = lines.slice(fn.start - 1, fn.end).join('\n');
    const content = beforeRender + stubs.replace(new RegExp(`const ${fn.name} = \\(\\) => <div>[^<]*</div>;`), origFn) + afterRender;
    process.stdout.write(`Un-stub ${fn.name} (${fn.start}-${fn.end})... `);
    const r = testContent(content, fn.name);
    console.log(r === true ? 'OK' : `ERROR: ${typeof r === 'string' ? r.substring(0, 80) : 'failed'}`);
  }
} else {
  // Test lines 1-639 alone
  console.log('\nLines 1-639 only:');
  const r = testContent(beforeRender + '\nexport default function T(){return<div/>;}\n', 'first-639');
  console.log(`  ${r}`);
  
  // Binary search lines 1-639
  let lo = 1, hi = 639;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const header = lines.slice(0, 5).join('\n') + '\n';
    const chunk = lines.slice(5, mid).join('\n');
    const content = header + chunk + '\n}\n';
    process.stdout.write(`Lines 1-${mid}... `);
    const r = testContent(content, `1-${mid}`);
    console.log(r === true ? 'OK' : 'ERROR');
    if (r === true) lo = mid + 1;
    else hi = mid;
  }
  console.log(`First error at line ${lo}`);
}

try { fs.unlinkSync(path.join(process.cwd(), '_test_rep.tsx')); } catch(ex) {}
