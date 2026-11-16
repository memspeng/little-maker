let python;
let inputState;
let inputBytes;
let outputSize = 0;
function output(text) {
  outputSize += text.length;
  if (outputSize > 60000) throw new Error('输出太多啦，请检查循环是否会结束。');
  postMessage({ type: 'output', text });
}
onmessage = async ({ data }) => {
  if (data.type !== 'run') return;
  try {
    inputState = new Int32Array(data.input, 0, 2);
    inputBytes = new Uint8Array(data.input, 8);
    outputSize = 0;
    const { loadPyodide } = await import('/python/pyodide.mjs');
    python = await loadPyodide({ indexURL: '/python/' });
    python.setStdout({ write: bytes => { output(new TextDecoder().decode(bytes)); return bytes.length; } });
    python.setStderr({ write: bytes => { output(new TextDecoder().decode(bytes)); return bytes.length; } });
    python.setStdin({ stdin: () => {
      postMessage({ type: 'input' });
      Atomics.wait(inputState, 0, 0);
      const value = new TextDecoder().decode(inputBytes.slice(0, Atomics.load(inputState, 1)));
      Atomics.store(inputState, 0, 0);
      output(value + '\n');
      postMessage({ type: 'running' });
      return value;
    }});
    postMessage({ type: 'running' });
    await python.runPythonAsync(data.code, { filename: '我的作品.py' });
    postMessage({ type: 'done' });
  } catch (error) {
    postMessage({ type: 'error', text: String(error) });
  }
};
