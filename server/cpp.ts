import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

type Result = { output: string; error: string; exitCode: number | null; timedOut: boolean };
let activeRequests = 0;
const controllers = new Set<AbortController>();
const cancelAll = () => { for (const controller of controllers) controller.abort(); };
function execute(command: string, args: string[], cwd: string, input: string, timeout: number, signal: AbortSignal): Promise<Result> {
  return new Promise(resolve => {
    let output = '', error = '', bytes = 0, timedOut = false, settled = false;
    const child = spawn(command, args, { cwd, shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'], env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP, HOME: cwd, LANG: 'en_US.UTF-8' } });
    const kill = () => {
      if (!child.pid) return;
      if (process.platform === 'win32') {
        const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
        killer.on('error', () => child.kill());
      } else {
        try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already exited */ }
      }
    };
    const timer = setTimeout(() => { timedOut = true; kill(); }, timeout);
    const abort = () => kill();
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) kill();
    const finish = (exitCode: number | null) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal.removeEventListener('abort', abort);
      // Remove descendants that might keep running after their parent exits.
      kill();
      resolve({ output, error, exitCode, timedOut });
    };
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    const collect = (text: string, isError: boolean) => {
      bytes += Buffer.byteLength(text);
      if (bytes > 60000) { error = '输出超过限制，请检查循环。'; kill(); return; }
      if (isError) error += text; else output += text;
    };
    child.stdout.on('data', text => collect(text, false));
    child.stderr.on('data', text => collect(text, true));
    child.stdin.on('error', () => { /* a program may exit before consuming stdin */ });
    child.on('error', e => { error = e.message; finish(null); });
    child.on('close', finish);
    child.stdin.end(input);
  });
}
async function compiler(signal: AbortSignal) {
  const candidates = process.env.CXX ? [process.env.CXX] : process.platform === 'darwin' ? ['clang++', 'g++'] : ['g++', 'clang++', ...(process.platform === 'win32' ? ['C:\\msys64\\ucrt64\\bin\\g++.exe', 'C:\\msys64\\mingw64\\bin\\g++.exe'] : [])];
  for (const command of candidates) {
    if (signal.aborted) throw new Error('操作已取消');
    const result = await execute(command, ['--version'], tmpdir(), '', 5000, signal);
    if (result.exitCode === 0) return { command, version: result.output.split('\n')[0] };
  }
  throw new Error('没有找到 C++ 编译器。Mac：在终端运行 xcode-select --install；Windows：安装 MSYS2 的 UCRT64 GCC（详见 README）。安装后重新启动小小造物室。');
}
function trusted(req: IncomingMessage) {
  const host = req.headers.host || '';
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) return false;
  if (req.headers['x-little-maker'] !== 'local-workshop') return false;
  if (req.headers.origin && req.headers.origin !== `http://${host}`) return false;
  return true;
}
async function handler(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const url = req.url?.split('?')[0];
  if (url !== '/api/compiler' && url !== '/api/cpp') return next();
  const reply = (status: number, data: unknown) => { if (!res.destroyed) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); } };
  if (!trusted(req)) return reply(403, { error: '仅允许本机工作台发起编译请求。' });
  if ((url === '/api/compiler' && req.method !== 'GET') || (url === '/api/cpp' && req.method !== 'POST')) return reply(405, { error: '请求方式不支持。' });
  if (activeRequests >= 2) return reply(429, { error: '已有程序正在编译或运行，请稍后再试。' });
  const controller = new AbortController();
  const aborted = () => { if (!res.writableEnded) controller.abort(); };
  res.on('close', aborted);
  activeRequests++; controllers.add(controller);
  let directory: string | undefined;
  try {
    if (url === '/api/compiler') { const found = await compiler(controller.signal); return reply(200, { version: found.version }); }
    req.setEncoding('utf8'); // Preserve Chinese characters split across network chunks.
    let body = '';
    for await (const chunk of req) {
      body += chunk.toString();
      if (Buffer.byteLength(body) > 150000) return reply(413, { error: '代码或输入太长，请缩短。' });
    }
    let data;
    try { data = JSON.parse(body); } catch { return reply(400, { error: '请求内容不是有效 JSON。' }); }
    if (typeof data.code !== 'string' || data.code.length > 50000 || !Array.isArray(data.inputs) || data.inputs.length < 1 || data.inputs.length > 20 || data.inputs.some((input: unknown) => typeof input !== 'string' || input.length > 20000)) return reply(400, { error: '代码或测试输入不符合要求。' });
    const found = await compiler(controller.signal);
    directory = await mkdtemp(path.join(tmpdir(), 'little-maker-'));
    const source = path.join(directory, 'main.cpp');
    const binary = path.join(directory, process.platform === 'win32' ? 'program.exe' : 'program');
    await writeFile(source, data.code, 'utf8');
    const compiled = await execute(found.command, ['-std=c++17', '-O0', '-Wall', '-Wextra', source, '-o', binary, ...(process.platform === 'win32' ? ['-static'] : [])], directory, '', 20000, controller.signal);
    if (controller.signal.aborted) return;
    const clean = (text: string) => text.split(directory!).join('作品');
    if (compiled.exitCode !== 0) return reply(200, { compileError: compiled.timedOut ? '编译超过 20 秒，请检查代码。' : clean(compiled.error || '编译失败'), results: [] });
    const results: Result[] = [];
    for (const input of data.inputs) {
      if (controller.signal.aborted) return;
      const result = await execute(binary, [], directory, input, 3000, controller.signal);
      results.push({ ...result, error: clean(result.error) });
    }
    reply(200, { results, warnings: clean(compiled.error) });
  } catch (error) {
    reply(400, { error: error instanceof Error ? error.message : String(error) });
  } finally {
    res.off('close', aborted); controllers.delete(controller); activeRequests--;
    if (directory) await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
  }
}
export function cppPlugin(): Plugin {
  return {
    name: 'local-cpp-runner',
    configureServer(server) { server.middlewares.use(handler); server.httpServer?.once('close', cancelAll); },
    configurePreviewServer(server) { server.middlewares.use(handler); server.httpServer.once('close', cancelAll); },
    closeBundle() { cancelAll(); },
  };
}
