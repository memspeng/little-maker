import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { python } from '@codemirror/lang-python';
import { cpp } from '@codemirror/lang-cpp';
import { catalog, languageName, type Language, type Unit } from './catalog';
import { normalized, runCpp, runPython, type RunResult } from './runtime';
import './style.css';

type Version = { code: string; time: string };
type Save = { code: string; title: string; step: number; completed: number[]; versions: Version[]; stdin: string };
type Report = { label: string; input: string; expected: string; actual: string; error: string; passed: boolean };
const storageKey = (unit: Unit, language: Language) => `little-maker-v2:${unit.id}:${language}`;
function readSave(unit = catalog[0], language: Language = 'python'): Save {
  const initial: Save = { code: unit.starters[language] || '', title: unit.title, step: 0, completed: [], versions: [], stdin: unit.cases?.[0]?.input || '' };
  try {
    const json = localStorage.getItem(storageKey(unit, language)) || (unit.id === 'guess' && language === 'python' ? localStorage.getItem('little-maker-v1') : null);
    const value = JSON.parse(json || 'null');
    if (value && typeof value.code === 'string' && typeof value.title === 'string' && Number.isInteger(value.step) && value.step >= 0 && value.step < unit.challenges.length && Array.isArray(value.completed) && Array.isArray(value.versions)) {
      return { ...value, stdin: typeof value.stdin === 'string' ? value.stdin : initial.stdin, completed: value.completed.filter((n: unknown) => Number.isInteger(n) && Number(n) >= 0 && Number(n) < unit.challenges.length), versions: value.versions.filter((v: Version) => v && typeof v.code === 'string' && typeof v.time === 'string').slice(0, 20) };
    }
  } catch { /* A malformed save must not prevent opening the app. */ }
  return initial;
}
function Editor({ code, language, onChange }: { code: string; language: Language; onChange: (code: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const callback = useRef(onChange); callback.current = onChange;
  useEffect(() => {
    view.current = new EditorView({ parent: host.current!, state: EditorState.create({ doc: code, extensions: [basicSetup, language === 'python' ? python() : cpp(), EditorView.lineWrapping, EditorView.contentAttributes.of({ 'aria-label': `${languageName(language)} 代码编辑器` }), EditorView.updateListener.of(update => { if (update.docChanged) callback.current(update.state.doc.toString()); })] }) });
    return () => view.current?.destroy();
  }, [language]);
  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== code) editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: code } });
  }, [code]);
  return <div className="editor" ref={host} />;
}
function friendlyError(error: string, language: Language) {
  if (error.includes('编译器')) return error;
  if (error.includes('超时')) return '程序还没有结束。检查循环条件，以及每次循环中变量有没有变化。';
  if (language === 'cpp') return '检查原始信息中的行号。常见原因包括漏掉分号、括号不配对、变量没有声明，以及输入数据不足。';
  if (error.includes('EOFError')) return '输入数据用完了。检查输入框中的数据行数，是否满足每次 input() 的需要。';
  if (error.includes('ValueError')) return '输入的内容可能无法变成整数。试试只输入数字，或查看输入保护提示。';
  if (error.includes('IndentationError')) return 'Python 用缩进表示代码属于哪一部分。检查报错行及它前面的 if、while 等语句。';
  if (error.includes('SyntaxError')) return '有一处语法需要检查：看看括号、引号和行末的冒号是否配对。';
  if (error.includes('NameError')) return '有一个名字还没有定义。检查变量拼写，并确认先赋值、后使用。';
  return '程序遇到了问题。展开原始报错，先查看最后几行和作品的行号。';
}
function App() {
  const [unit, setUnit] = useState(catalog[0]);
  const [language, setLanguage] = useState<Language>('python');
  const [save, setSave] = useState<Save>(() => readSave());
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
  const [library, setLibrary] = useState(false);
  const [libraryTab, setLibraryTab] = useState<'project' | 'problem'>('project');
  const [notice, setNotice] = useState('');
  const [reports, setReports] = useState<Report[]>([]);
  const [compilerInfo, setCompilerInfo] = useState('');
  const operation = useRef<AbortController | null>(null);
  const sendInput = useRef<((value: string) => void) | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const consoleRef = useRef<HTMLPreElement>(null);
  const challenge = unit.challenges[save.step];
  const isProblem = unit.kind === 'problem';
  const batch = language === 'cpp' || isProblem;
  const ext = language === 'python' ? 'py' : 'cpp';
  useEffect(() => {
    try { localStorage.setItem(storageKey(unit, language), JSON.stringify(save)); setStorageError(false); } catch { setStorageError(true); }
  }, [save, unit, language]);
  useEffect(() => { if (waiting) inputRef.current?.focus(); }, [waiting]);
  useEffect(() => { consoleRef.current?.scrollTo(0, consoleRef.current.scrollHeight); }, [output]);
  useEffect(() => () => operation.current?.abort(), []);
  const stop = () => {
    operation.current?.abort(); operation.current = null; sendInput.current = null;
    setBusy(false); setWaiting(false); setStatus('已停止，可以修改后再试');
  };
  const snapshot = (current: Save) => current.versions[0]?.code === current.code ? current.versions : [{ code: current.code, time: new Date().toLocaleString('zh-CN') }, ...current.versions].slice(0, 20);
  const openUnit = (next: Unit, nextLanguage: Language) => {
    stop(); setUnit(next); setLanguage(nextLanguage); setSave(readSave(next, nextLanguage));
    setHints(0); setChecks([false, false, false]); setOutput(''); setError(''); setReports([]); setNotice(''); setStatus('准备就绪'); setLibrary(false); setHistory(false); setCompilerInfo('');
  };
  const start = () => {
    const controller = new AbortController(); operation.current = controller;
    setSave(s => ({ ...s, versions: snapshot(s) }));
    setOutput(''); setError(''); setReports([]); setInput(''); setBusy(true); setWaiting(false); setNotice('');
    setStatus(language === 'python' ? '正在启动 Python…' : '正在编译 C++…');
    return controller;
  };
  const finish = (controller: AbortController) => {
    if (operation.current === controller) { operation.current = null; sendInput.current = null; setBusy(false); setWaiting(false); }
  };
  const run = async () => {
    if (busy) return;
    const controller = start();
    try {
      let result: RunResult;
      if (language === 'cpp') result = (await runCpp(save.code, [save.stdin], controller.signal))[0];
      else result = await runPython(save.code, batch ? save.stdin : null, controller.signal, {
        output: text => setOutput(current => (current + text).slice(-60000)),
        status: setStatus,
        input: send => { sendInput.current = send; setWaiting(true); },
      });
      if (controller.signal.aborted) return;
      setOutput(result.output);
      setError(result.error || (result.exitCode !== 0 ? `程序以状态 ${result.exitCode} 退出，请检查输入与代码。` : ''));
      setStatus(result.timedOut ? '运行超时' : result.exitCode === 0 && !result.error ? '运行结束' : '有个小问题，一起看看');
    } catch (e) {
      if (!controller.signal.aborted) { setError(String(e instanceof Error ? e.message : e)); setStatus('运行失败'); }
    } finally { finish(controller); }
  };
  const judge = async () => {
    if (busy || !unit.cases) return;
    const controller = start();
    const cases = unit.cases;
    setStatus(`正在测试 0 / ${cases.length}`);
    try {
      const results: RunResult[] = [];
      if (language === 'cpp') results.push(...await runCpp(save.code, cases.map(c => c.input), controller.signal));
      else for (let i = 0; i < cases.length; i++) {
        setStatus(`正在测试 ${i + 1} / ${cases.length}`);
        results.push(await runPython(save.code, cases[i].input, controller.signal));
      }
      if (controller.signal.aborted) return;
      const nextReports = cases.map((item, i) => {
        const result = results[i];
        return { label: item.label, input: item.input, expected: item.output, actual: result.output, error: result.timedOut ? '运行超时（3 秒）' : result.error || (result.exitCode !== 0 ? `运行异常：${result.exitCode}` : ''), passed: result.exitCode === 0 && !result.error && !result.timedOut && normalized(result.output) === normalized(item.output) };
      });
      setReports(nextReports);
      const passed = nextReports.filter(r => r.passed).length;
      setStatus(`测试完成：${passed} / ${cases.length} 通过`);
      if (passed === cases.length) {
        setSave(s => ({ ...s, completed: [0] }));
        setNotice('全部内置测试通过！再想一个自己的边界用例，验证你理解了这个方法。');
      }
    } catch (e) {
      if (!controller.signal.aborted) { setError(String(e instanceof Error ? e.message : e)); setStatus('测试未完成'); }
    } finally { finish(controller); }
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!waiting || !sendInput.current) return;
    try { sendInput.current(input); setInput(''); setWaiting(false); } catch (e) { setNotice(String(e instanceof Error ? e.message : e)); }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([save.code], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `我的作品.${ext}`; anchor.click(); URL.revokeObjectURL(url);
  };
  const changeStep = (step: number) => { setSave(s => ({ ...s, step })); setHints(0); setChecks([false, false, false]); setNotice(''); };
  const checkCompiler = async () => {
    setCompilerInfo('正在检测…');
    try {
      const response = await fetch('/api/compiler', { headers: { 'X-Little-Maker': 'local-workshop' } });
      const data = await response.json(); setCompilerInfo(data.version || data.error || '检测失败');
    } catch { setCompilerInfo('无法连接本地编译服务，请使用启动脚本运行。'); }
  };
  return <div className="app">
    <header><div className="brand"><span className="logo">✳</span><div><strong>小小造物室</strong><small>把一个想法，变成自己的作品</small></div></div><button className="library-button" onClick={() => setLibrary(true)}>项目与题库</button><span className={storageError ? 'save-error' : 'saved'}>{storageError ? '保存失败，请导出代码备份' : '● 已保存在这台电脑'}</span><button onClick={download}>导出 .{ext}</button></header>
    <main>
      <section className="project-heading"><div><div className="eyebrow">{languageName(language).toUpperCase()} 实验室 / {isProblem ? '竞赛入门' : '创作项目'}</div><input aria-label="作品名称" className="project-title" maxLength={40} value={save.title} onChange={e => setSave(s => ({ ...s, title: e.target.value }))}/><p>{unit.description}</p><div className="language-switch" aria-label="编程语言">{(['python', 'cpp'] as Language[]).map(lang => <button key={lang} disabled={!unit.starters[lang] || busy} className={lang === language ? 'selected' : ''} onClick={() => { if (lang !== language) openUnit(unit, lang); }}>{languageName(lang)}</button>)}<span>每种语言独立保存代码与进度</span></div></div><div className="progress"><strong>{save.completed.length}<span> / {unit.challenges.length}</span></strong><small>{isProblem ? '题目曾通过测试' : '个挑战已完成'}</small></div></section>
      {!isProblem && <nav aria-label="项目挑战">{unit.challenges.map((item, index) => <button key={item.title} className={save.step === index ? 'step active' : 'step'} onClick={() => changeStep(index)}><span>{save.completed.includes(index) ? '✓' : `0${index + 1}`}</span>{unit.id === 'guess' ? ['调整难度', '记录次数', '限制机会', '保护输入', '自由创作'][index] : item.title}</button>)}</nav>}
      {language === 'cpp' && <div className="native-info"><span>C++17 · 在本机编译运行，请只运行自己或家长检查过的代码。先填好输入数据，再运行。</span><button onClick={checkCompiler}>检查 C++ 环境</button>{compilerInfo && <p role="note">{compilerInfo}</p>}</div>}
      <div className="workspace">
        <section className="code-panel"><div className="panel-heading"><span><span className="file-icon">{language === 'python' ? 'Py' : 'C++'}</span> 我的作品.{ext}</span><div><button disabled={!busy} onClick={stop}>■ 停止</button><button className="primary" disabled={busy} onClick={run}>▶ 运行作品</button></div></div><Editor code={save.code} language={language} onChange={code => { setSave(s => ({ ...s, code })); setReports([]); }}/><div className="editor-footer"><span>{languageName(language)} · 自动保存</span><button onClick={() => setHistory(true)}>↶ 版本记录</button></div></section>
        <aside>
          <section className="challenge card"><div className="eyebrow">{isProblem ? '原创竞赛入门练习' : '今天的小目标'} <span>{save.step + 1} / {unit.challenges.length}</span></div><h2>{isProblem ? unit.title : challenge.title}</h2><span className="tag">{challenge.tag}</span><p>{isProblem ? unit.statement : challenge.goal}</p>
            {isProblem && <div className="problem-statement"><h3>输入格式</h3><p>{unit.inputFormat}</p><h3>输出格式</h3><p>{unit.outputFormat}</p><p className="limits">数据范围：{unit.limits}</p><div className="sample"><div><h3>样例输入</h3><pre>{unit.cases![0].input}</pre></div><div><h3>样例输出</h3><pre>{unit.cases![0].output}</pre></div></div><p className="muted">按空白分隔比较输出，忽略多余空格和换行。不要输出“请输入”等提示文字。通过内置测试不代表通过正式竞赛评测。</p></div>}
            <button className="hint-button" disabled={hints === challenge.hints.length} onClick={() => setHints(h => h + 1)}>☀ {hints === 0 ? '给我一点提示' : hints === challenge.hints.length ? '提示已全部展开' : '再给我一点提示'}</button>{challenge.hints.slice(0, hints).map((hint, i) => <div className="hint" key={i}><small>提示 {i + 1}</small><pre>{hint}</pre></div>)}
            {isProblem ? <p className="reflection">想一想：{challenge.reflection}</p> : <details className="verify"><summary>我来检查一下</summary><p className="muted">先运行验证，再勾选。这是自查，不是自动判分。</p>{challenge.checks.map((check, i) => <label key={check}><input type="checkbox" checked={checks[i]} onChange={e => setChecks(items => items.map((value, n) => n === i ? e.target.checked : value))}/>{check}</label>)}<button className="primary" disabled={!checks.every(Boolean)} onClick={() => { setSave(s => ({ ...s, completed: [...new Set([...s.completed, s.step])] })); setNotice(save.step === unit.challenges.length - 1 ? '你的特别版完成啦！导出作品，向家人展示你的创意吧。' : '挑战完成！准备好后，点击上方下一个挑战继续。'); }}>记录挑战完成</button><p className="reflection">想一想：{challenge.reflection}</p></details>}
          </section>
          {batch && <section className="card batch-input"><label htmlFor="stdin">输入数据 <small>运行前填写，多行输入直接换行</small></label><textarea id="stdin" aria-label="输入数据" rows={5} value={save.stdin} onChange={e => setSave(s => ({ ...s, stdin: e.target.value }))}/>{unit.cases?.[0] && <button onClick={() => setSave(s => ({ ...s, stdin: unit.cases![0].input }))}>填入样例</button>}{isProblem && <button className="primary" disabled={busy} onClick={judge}>提交测试 · {unit.cases!.length} 组数据</button>}</section>}
          <section className="console card"><div className="panel-heading"><strong>运行结果</strong><span className={waiting ? 'status waiting' : 'status'} role="status">{status}</span></div><pre ref={consoleRef} aria-label="运行输出" tabIndex={0}>{output || '点击「运行作品」，让代码动起来。'}</pre>{error && <div className="error" role="alert"><strong>我们发现了一个小问题</strong><p>{friendlyError(error, language)}</p><details><summary>查看原始报错</summary><pre>{error}</pre></details></div>}{!batch && <form onSubmit={submit}><input ref={inputRef} aria-label="程序输入" placeholder={waiting ? '在这里输入，按回车发送…' : '程序需要输入时，在这里回答'} disabled={!waiting} value={input} onChange={e => setInput(e.target.value)}/><button type="submit" disabled={!waiting}>发送 ↵</button></form>}</section>
          {reports.length > 0 && <section className="card report-panel"><h3>测试反馈</h3><p className="muted">对应本次提交时的代码，修改后请重新测试。</p>{reports.map((report, i) => <details key={i} className={report.passed ? 'case passed' : 'case failed'}><summary>{report.passed ? '✓' : '✗'} {i + 1}. {report.label} · {report.passed ? '通过' : report.error ? '运行异常' : '答案不同'}</summary><h4>输入</h4><pre>{report.input}</pre><h4>期望输出</h4><pre>{report.expected}</pre><h4>你的输出</h4><pre>{report.actual || '（没有输出）'}</pre>{report.error && <pre>{report.error}</pre>}</details>)}</section>}
        </aside>
      </div>
      {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')}>知道啦</button></div>}
      <footer>每次只改一点点，运行看看，再试一次。<span>本地原型 v0.2 · Python + C++ · 暂未接入 AI · 数据保存在当前浏览器</span></footer>
    </main>
    {library && <div className="modal-backdrop"><section className="modal library-modal" role="dialog" aria-modal="true" aria-label="项目与题库"><div className="panel-heading"><h2>挑一个想做的挑战</h2><button onClick={() => setLibrary(false)}>关闭</button></div><p>建议先做项目，再挑战算法题；B、C 组会引入新知识，可以慢慢来。</p><div className="library-tabs"><button className={libraryTab === 'project' ? 'primary' : ''} onClick={() => setLibraryTab('project')}>创作项目 · 5</button><button className={libraryTab === 'problem' ? 'primary' : ''} onClick={() => setLibraryTab('problem')}>算法练习 · 8</button></div>{libraryTab === 'problem' && <p>原创竞赛入门练习，参考常见算法知识点设计，非历年奥赛真题。</p>}<div className="unit-grid">{catalog.filter(item => item.kind === libraryTab).map(item => <article className="unit-card" key={item.id}><span className="tag">{item.level}</span><h3>{item.title}</h3><p>{item.description}</p><div>{(['python', 'cpp'] as Language[]).filter(lang => item.starters[lang]).map(lang => <button key={lang} onClick={() => openUnit(item, lang)}>{languageName(lang)} 开始</button>)}</div></article>)}</div></section></div>}
    {history && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-label="版本记录"><div className="panel-heading"><h2>版本记录</h2><button onClick={() => setHistory(false)}>关闭</button></div><p>当前项目、当前语言独立保存。每次运行前保存快照，最多保留 20 份。恢复前会保留当前代码。</p>{save.versions.length === 0 && <p>还没有快照，运行一次作品就会自动保存。</p>}<div className="versions">{save.versions.map((version, i) => <div key={i}><span>{version.time}<small>{version.code.split('\n').length} 行代码</small></span><button onClick={() => { setSave(s => ({ ...s, versions: snapshot(s), code: version.code })); setHistory(false); setNotice('已恢复版本，你刚才的代码也保留在版本记录中。'); }}>恢复</button></div>)}</div><button onClick={() => { setSave(s => ({ ...s, versions: snapshot(s), code: unit.starters[language]! })); setHistory(false); setNotice('已载入起始代码，之前的代码保留在版本记录中。'); }}>重新载入起始代码</button></section></div>}
  </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
