export type RunResult = { output: string; error: string; exitCode: number | null; timedOut: boolean };
export type PythonEvents = { output?: (text: string) => void; status?: (text: string) => void; input?: (send: (value: string) => void) => void };
export function runPython(code: string, stdin: string | null, signal: AbortSignal, events: PythonEvents = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    if (!crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') return reject(new Error('浏览器未启用安全运行环境，请从启动脚本打开本机地址。'));
    if (signal.aborted) return reject(new DOMException('已停止', 'AbortError'));
    const buffer = new SharedArrayBuffer(8 + 8192);
    const worker = new Worker('/python-worker.js', { type: 'module' });
    let output = '', settled = false, waiting = false;
    let timer: ReturnType<typeof setTimeout>;
    const cleanup = () => { clearTimeout(timer); worker.terminate(); signal.removeEventListener('abort', abort); };
    const done = (result: RunResult) => { if (settled) return; settled = true; cleanup(); resolve(result); };
    const abort = () => { if (settled) return; settled = true; cleanup(); reject(new DOMException('已停止', 'AbortError')); };
    const watch = (ms: number) => { clearTimeout(timer); timer = setTimeout(() => done({ output, error: '运行超时，请检查循环是否结束。', exitCode: null, timedOut: true }), ms); };
    signal.addEventListener('abort', abort, { once: true });
    watch(60000); // Python startup is excluded from the shorter batch time limit.
    worker.onmessage = ({ data }) => {
      if (settled) return;
      if (data.type === 'output') { output = (output + data.text).slice(-60000); events.output?.(data.text); }
      if (data.type === 'running') { waiting = false; events.status?.('正在运行 · 修改会在下次运行生效'); watch(stdin === null ? 60000 : 3000); }
      if (data.type === 'input') {
        clearTimeout(timer); waiting = true; events.status?.('正在等你输入');
        events.input?.(value => {
          if (!waiting || settled) return;
          const encoded = new TextEncoder().encode(value);
          if (encoded.length > 8192) throw new Error('输入太长啦，请缩短后再试。');
          const state = new Int32Array(buffer, 0, 2);
          new Uint8Array(buffer, 8).set(encoded);
          Atomics.store(state, 1, encoded.length); Atomics.store(state, 0, 1); Atomics.notify(state, 0);
          waiting = false;
        });
      }
      if (data.type === 'done') done({ output, error: '', exitCode: 0, timedOut: false });
      if (data.type === 'error') done({ output, error: data.text, exitCode: 1, timedOut: false });
    };
    worker.onerror = event => done({ output, error: event.message || 'Python 加载失败，请检查运行资源或 IDM 拦截设置。', exitCode: 1, timedOut: false });
    worker.postMessage({ type: 'run', code, input: buffer, batch: stdin !== null, stdin });
  });
}
export async function runCpp(code: string, inputs: string[], signal: AbortSignal): Promise<RunResult[]> {
  const response = await fetch('/api/cpp', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Little-Maker': 'local-workshop' }, body: JSON.stringify({ code, inputs }), signal });
  const data = await response.json();
  if (!response.ok || data.error || data.compileError) throw new Error(data.error || data.compileError || 'C++ 运行失败');
  return data.results;
}
export const normalized = (text: string) => text.trim().split(/\s+/).filter(Boolean).join(' ');
