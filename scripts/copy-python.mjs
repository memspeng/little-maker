import { cp, mkdir } from 'node:fs/promises';
await mkdir('public/python', { recursive: true });
for (const file of ['pyodide.mjs', 'pyodide.asm.js', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json']) {
  await cp(`node_modules/pyodide/${file}`, `public/python/${file}`);
}
console.log('Python 运行资源已复制，可以离线运行。');
