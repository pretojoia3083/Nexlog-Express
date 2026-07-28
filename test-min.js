const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

function test(name, content) {
  const tmpFile = path.join(process.cwd(), '_test_min.tsx');
  fs.writeFileSync(tmpFile, content);
  try {
    execSync(`npx esbuild _test_min.tsx --jsx=automatic --loader:.tsx=tsx --outfile=/dev/null 2>nul`, { encoding: 'utf8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] });
    return true;
  } catch (e) {
    return false;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch(ex) {}
  }
}

// Test 1: Simple JSX with > comparison
console.log('Test > comparison:', test('gt', `
"use client";
import React from 'react';
export default function T() {
  const x = 5;
  return <div>{x > 0 && <span>yes</span>}</div>;
}
`));

// Test 2: Deeper nesting with >
console.log('Test nested >:', test('nested-gt', `
"use client";
import React from 'react';
export default function T() {
  return (
    <div>
      <div>
        <div>
          <div>
            <div>
              <div>{true && <span>{5 > 0 ? 'a' : 'b'}</span>}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
`));

// Test 3: Many > comparisons in sequence
console.log('Test many >:', test('many-gt', `
"use client";
import React from 'react';
export default function T() {
  return (
    <div>
      {5 > 0 && <div><span>a</span></div>}
      {5 > 0 && <div><span>b</span></div>}
      {5 > 0 && <div><span>c</span></div>}
      {5 > 0 && <div><span>d</span></div>}
      {5 > 0 && <div><span>e</span></div>}
    </div>
  );
}
`));

// Test 4: Fragment with >
console.log('Test fragment >:', test('frag-gt', `
"use client";
import React from 'react';
export default function T() {
  return (
    <div>
      <div>
        {5 > 0 && (
          <>
            <div><span>x</span></div>
            {5 > 0 && <div><span>y</span></div>}
          </>
        )}
      </div>
    </div>
  );
}
`));

// Test 5: Complex inline styles with >
console.log('Test styles >:', test('styles-gt', `
"use client";
import React from 'react';
export default function T() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
      <div>
        <div>
          <label>Peso</label>
          <input style={{ width: '100%', padding: '10px 14px' }} />
        </div>
          <label>Valor</label>
          <input style={{ width: '100%', padding: '10px 14px' }} />
        </div>
      </div>
    </div>
  );
}
`));
