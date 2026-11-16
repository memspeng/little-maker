import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { python } from '@codemirror/lang-python';
import { challenges, starter } from './projects';
import './style.css';

type Version = { code: string; time: string };
type Save = { code: string; title: string; step: number; completed: number[]; versions: Version[] };
const KEY = 'little-maker-v1';
const initial: Save = { code: starter, title: '我的秘密数字', step: 0, completed: [], versions: [] };
function readSave(): Save {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (value && typeof value.code === 'string' && typeof value.title === 'string' && Number.isInteger(value.step) && value.step >= 0 && value.step < challenges.length && Array.isArray(value.completed) && Array.isArray(value.versions)) {
      return { ...value, completed: value.completed.filter((n: unknown) => Number.isInteger(n) && Number(n) >= 0 && Number(n) < 5), versions: value.versions.filter((v: Version) => v && typeof v.code === 'string' && typeof v.time === 'string').slice(0, 20) };
    }
  } catch { /* An unreadable save must not prevent opening the editor. */ }
  return initial;
}
function Editor({ code, onChange }: { code: string; onChange: (code: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const callback = useRef(onChange);
  callback.current = onChange;
  useEffect(() => {
    view.current = new EditorView({ parent: host.current!, state: EditorState.create({ doc: code, extensions: [basicSetup, python(), EditorView.lineWrapping, EditorView.contentAttributes.of({ 'aria-label': 'Python 代码编辑器' }), EditorView.updateListener.of(update => { if (update.docChanged) callback.current(update.state.doc.toString()); })] }) });
    return () => view.current?.destroy();
  }, []);
  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== code) editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: code } });
  }, [code]);
  return <div className="editor" ref={host} />;
}
function friendlyError(error: string) {
  if (error.includes('ValueError')) return '输入的内容可能无法变成整数。试试只输入数字，或查看第 4 个挑战里的输入保护提示。';
  if (error.includes('IndentationError')) return 'Python 用缩进表示代码属于哪一部分。检查报错行及它前面的 if、while 等语句。';
  if (error.includes('SyntaxError')) return '有一处语法需要检查：看看括号、引号和行末的冒号是否配对。';
  if (error.includes('NameError')) return '有一个名字还没有定义。检查变量拼写，并确认先赋值、后使用。';
  return '程序遇到了问题。展开下面的原始报错，先找最后几行和“我的作品.py”的行号。';
}
function App() {
  const [save, setSave] = useState<Save>(readSave);
  const [storageError, setStorageError] = useState(false);
  const [status, setStatus] = useState('准备就绪');
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [hints, setHints] = useState(0);
  const [checks, setChecks] = useState<boolean[]>([false, false, false]);
  const [history, setHistory] = useState(false);
  const [notice, setNotice] = useState('');
  const worker = useRef<Worker | null>(null);
  const buffer = useRef<SharedArrayBuffer | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const consoleRef = useRef<HTMLPreElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const challenge = challenges[save.step];
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(save)); setStorageError(false); } catch { setStorageError(true); }
  }, [save]);
  useEffect(() => { if (waiting) inputRef.current?.focus(); }, [waiting]);
  useEffect(() => { consoleRef.current?.scrollTo(0, consoleRef.current.scrollHeight); }, [output]);
  useEffect(() => () => { worker.current?.terminate(); clearTimeout(timer.current); }, []);
  const end = (message: string) => {
    worker.current?.terminate(); worker.current = null;
    clearTimeout(timer.current); setBusy(false); setWaiting(false); setStatus(message);
  };
  const snapshot = (current: Save) => current.versions[0]?.code === current.code ? current.versions : [{ code: current.code, time: new Date().toLocaleString('zh-CN') }, ...current.versions].slice(0, 20);
  const run = () => {
    if (busy) return;
    if (!crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') {
      setError('浏览器没有启用安全运行环境。请使用启动脚本打开 localhost 地址，并使用最新版 Chrome、Edge 或 Safari。'); return;
    }
    setSave(s => ({ ...s, versions: snapshot(s) }));
    setOutput(''); setError(''); setInput(''); setBusy(true); setWaiting(false); setStatus('正在启动 Python…');
    buffer.current = new SharedArrayBuffer(8 + 8192);
    const active = new Worker('/python-worker.js', { type: 'module' });
    worker.current = active;
    const watchdog = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => { if (worker.current === active) end('运行已超时停止，请检查循环'); }, 60000);
    };
    watchdog();
    active.onmessage = ({ data }) => {
      if (worker.current !== active) return;
      if (data.type === 'output') setOutput(text => (text + data.text).slice(-60000));
      if (data.type === 'running') { setWaiting(false); setStatus('正在运行 · 修改会在下次运行生效'); watchdog(); }
      if (data.type === 'input') { clearTimeout(timer.current); setWaiting(true); setStatus('正在等你输入'); }
      if (data.type === 'done') end('运行结束');
      if (data.type === 'error') { setError(data.text); end('有个小问题，一起看看'); }
    };
    active.onerror = event => { setError(event.message || 'Python 加载失败，请重新运行或重新执行 npm install。'); end('运行失败'); };
    active.postMessage({ type: 'run', code: save.code, input: buffer.current });
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!waiting || !buffer.current) return;
    const encoded = new TextEncoder().encode(input);
    if (encoded.length > 8192) { setNotice('输入太长啦，请缩短后再试。'); return; }
    const state = new Int32Array(buffer.current, 0, 2);
    new Uint8Array(buffer.current, 8).set(encoded);
    Atomics.store(state, 1, encoded.length);
    Atomics.store(state, 0, 1);
    Atomics.notify(state, 0);
    setInput(''); setWaiting(false);
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([save.code], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = '我的作品.py'; anchor.click(); URL.revokeObjectURL(url);
  };
  const changeStep = (step: number) => { setSave(s => ({ ...s, step })); setHints(0); setChecks([false, false, false]); setNotice(''); };
  return <div className="app">
    <header><div className="brand"><span className="logo">✳</span><div><strong>小小造物室</strong><small>把一个想法，变成自己的作品</small></div></div><span className={storageError ? 'save-error' : 'saved'}>{storageError ? '保存失败，请导出代码备份' : '● 已保存在这台电脑'}</span><button onClick={download}>导出 .py</button></header>
    <main>
      <section className="project-heading"><div><div className="eyebrow">PYTHON 实验室 / 项目 01</div><input aria-label="作品名称" className="project-title" maxLength={40} value={save.title} onChange={e => setSave(s => ({ ...s, title: e.target.value }))}/><p>猜数字游戏 <span>从一个小游戏，开始你的创作。</span></p></div><div className="progress"><strong>{save.completed.length}<span> / 5</span></strong><small>个挑战已完成</small></div></section>
      <nav aria-label="项目挑战">{challenges.map((item, index) => <button key={item.title} className={save.step === index ? 'step active' : 'step'} onClick={() => changeStep(index)}><span>{save.completed.includes(index) ? '✓' : `0${index + 1}`}</span>{['调整难度', '记录次数', '限制机会', '保护输入', '自由创作'][index]}</button>)}</nav>
      <div className="workspace">
        <section className="code-panel"><div className="panel-heading"><span><span className="file-icon">Py</span> 我的作品.py</span><div><button disabled={!busy} onClick={() => end('已停止，可以修改后再试')}>■ 停止</button><button className="primary" disabled={busy} onClick={run}>▶ 运行作品</button></div></div><Editor code={save.code} onChange={code => setSave(s => ({ ...s, code }))}/><div className="editor-footer"><span>Python · 自动保存</span><button onClick={() => setHistory(true)}>↶ 版本记录</button></div></section>
        <aside>
          <section className="challenge card"><div className="eyebrow">今天的小目标 <span>{save.step + 1} / 5</span></div><h2>{challenge.title}</h2><span className="tag">{challenge.tag}</span><p>{challenge.goal}</p><button className="hint-button" disabled={hints === challenge.hints.length} onClick={() => setHints(h => h + 1)}>☀ {hints === 0 ? '给我一点提示' : hints === 3 ? '提示已全部展开' : '再给我一点提示'}</button>{challenge.hints.slice(0, hints).map((hint, i) => <div className="hint" key={i}><small>提示 {i + 1}</small><pre>{hint}</pre></div>)}<details className="verify"><summary>我来检查一下</summary><p className="muted">先运行验证，再勾选。这是自查，不是自动判分。</p>{challenge.checks.map((check, i) => <label key={check}><input type="checkbox" checked={checks[i]} onChange={e => setChecks(items => items.map((value, n) => n === i ? e.target.checked : value))}/>{check}</label>)}<button className="primary" disabled={!checks.every(Boolean)} onClick={() => { setSave(s => ({ ...s, completed: [...new Set([...s.completed, s.step])] })); setNotice(save.step === 4 ? '你的特别版完成啦！导出作品，向家人展示你的创意吧。' : '挑战完成！准备好后，点击上方下一个挑战继续。'); }}>记录挑战完成</button><p className="reflection">想一想：{challenge.reflection}</p></details></section>
          <section className="console card"><div className="panel-heading"><strong>运行结果</strong><span className={waiting ? 'status waiting' : 'status'} role="status">{status}</span></div><pre ref={consoleRef} aria-label="运行输出" tabIndex={0}>{output || '点击「运行作品」，让代码动起来。'}</pre>{error && <div className="error" role="alert"><strong>我们发现了一个小问题</strong><p>{friendlyError(error)}</p><details><summary>查看原始报错</summary><pre>{error}</pre></details></div>}<form onSubmit={submit}><input ref={inputRef} aria-label="程序输入" placeholder={waiting ? '在这里输入，按回车发送…' : '程序需要输入时，在这里回答'} disabled={!waiting} value={input} onChange={e => setInput(e.target.value)}/><button type="submit" disabled={!waiting}>发送 ↵</button></form></section>
        </aside>
      </div>
      {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')}>知道啦</button></div>}
      <footer>每次只改一点点，运行看看，再试一次。<span>本地原型 v0.1 · 暂未接入 AI · 数据保存在当前浏览器</span></footer>
    </main>
    {history && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-label="版本记录"><div className="panel-heading"><h2>版本记录</h2><button onClick={() => setHistory(false)}>关闭</button></div><p>每次运行前保存快照，最多保留 20 份。恢复前会保留当前代码。</p>{save.versions.length === 0 && <p>还没有快照，运行一次作品就会自动保存。</p>}<div className="versions">{save.versions.map((version, i) => <div key={i}><span>{version.time}<small>{version.code.split('\n').length} 行代码</small></span><button onClick={() => { setSave(s => ({ ...s, versions: snapshot(s), code: version.code })); setHistory(false); setNotice('已恢复版本，你刚才的代码也保留在版本记录中。'); }}>恢复</button></div>)}</div><button onClick={() => { setSave(s => ({ ...s, versions: snapshot(s), code: starter })); setHistory(false); setNotice('已载入起始代码，之前的代码保留在版本记录中。'); }}>重新载入起始代码</button></section></div>}
  </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
