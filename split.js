const fs = require('fs');
const cp = require('child_process');
const lines = fs.readFileSync('src/app/page.tsx', 'utf8').split('\n');
const esbuild = 'C:\\Users\\Renato\\AppData\\Local\\npm-cache\\_npx\\beb367dfa21eb3f5\\node_modules\\esbuild\\bin\\esbuild';

function testLines(n) {
  const part = lines.slice(0, n).join('\n');
  const testContent = part + '\n}\n';
  fs.writeFileSync('src/app/page_test.tsx', testContent);
  try {
    const r = cp.execSync('"' + esbuild + '" src/app/page_test.tsx --bundle --jsx=automatic --loader:.tsx=tsx --outfile=/dev/null 2>&1', { encoding: 'utf8', timeout: 10000, cwd: 'C:\\Users\\Renato\\OneDrive\\Desktop\\nexlog' });
    return { ok: true, out: r.substring(0, 100) };
  } catch(e) {
    return { ok: false, out: (e.stdout || e.message).substring(0, 300) };
  }
}

[500, 600, 700, 800, 850].forEach(n => {
  const r = testLines(n);
  console.log(n + ' lines: ' + (r.ok ? 'OK' : 'FAIL') + ' ' + r.out.replace(/\n/g, ' ').trim());
});
