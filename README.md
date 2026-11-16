# ✳ 小小造物室

给孩子的项目式 Python 编程工作台。以猜数字游戏为起点，通过修改、运行、自查，逐渐做出自己的版本。

**当前版本：本地浏览器原型 v0.1，不是原生桌面安装包。支持 Windows / macOS，不需要安装 Python。尚未接入 AI 或 C++。**

## 第一次启动（Mac，包括 M1 8GB）

1. 从 [Node.js 官网](https://nodejs.org/) 安装 **22 或 24 LTS**。M1 芯片选择 macOS ARM64 安装包。
2. 在 GitHub 点击绿色 **Code → Download ZIP**，下载并解压项目。
3. 打开终端，输入 `cd `（cd 后有空格），把解压后的文件夹拖入终端，再按回车。
4. 逐行运行：

```bash
npm ci
npm run dev -- --open
```

浏览器会打开终端显示的本地网址，通常是 http://127.0.0.1:5173 。保持终端开启即可使用；按 Control+C 停止。

之后可以在项目文件夹运行 `bash start-mac.command`；若系统允许，也可双击该文件。下载 ZIP 后若缺少执行权限，终端方式最可靠，无须关闭系统安全设置。

## Windows 启动

安装 Node.js 22 或 24 LTS，下载并**解压**项目，双击 `start-windows.bat`。也可在项目文件夹打开 PowerShell：

```powershell
npm ci
npm run dev -- --open
```

首次安装需要网络。安装后 Python 运行文件在本地，正常编辑、运行及提示不需要访问云端。推荐最新版 Chrome / Edge；Mac Safari 需要实际设备验证，遇到问题先使用 Chrome。

## 如何使用

- 点击“运行作品”，在右下方输入数字并按回车。
- 依次尝试调整难度、记录次数、限制机会、保护输入、自由创作五个挑战。
- “给我一点提示”逐层展开预设提示；没有使用 AI，也不会上传代码。
- “我来检查一下”是**孩子自查**，不会自动判分。
- 每次运行前自动保存代码快照；“版本记录”可恢复最近 20 个不同快照。恢复前保留当前代码。
- 修改代码后需要重新运行，当前运行使用启动时的代码。
- 程序计算运行超过 60 秒自动停止；等待孩子输入时暂停计时。可随时按停止。
- 输出超过约 60,000 字符时中止，避免输出失控。
- 清空浏览器数据、切换浏览器或换电脑不会携带进度。请定期点击“导出 .py”备份作品。GitHub 同步的是软件源码，**不会同步孩子作品**。
- 多个浏览器标签页不要同时编辑同一个作品。

## 常见问题

**打开后不能运行 Python？**

不要直接双击 `index.html`。必须通过上述命令启动本地服务，它会设置 SharedArrayBuffer 所需的 COOP/COEP 响应头。使用浏览器普通窗口，地址以本机 localhost 或 127.0.0.1 开头。

**首次加载有点慢？**

Python WebAssembly 资源较大。每次运行创建独立 Worker，确保上次运行的变量不会污染下一次。可查看运行状态，必要时停止重试。

**安装失败？**

确认 `node -v` 显示 22 或 24，检查网络后重试 `npm ci`。不要在 GitHub ZIP 压缩包中直接启动。

**在 Windows 改过代码，Mac 怎样继续？**

先在 Windows 导出 `.py`，在 Mac 用文本编辑器打开，复制到代码区。当前没有自动作品同步和导入按钮。

## 开发与验证

```bash
npm ci
npm run build
npx playwright install chromium
npm test
```

测试覆盖真实 Python 的多轮输入、中文输入输出、报错、死循环停止与恢复、自动保存、版本恢复、自查进度和导出。CI 配置在 Windows、macOS 和 Linux 上构建并运行 Chromium 测试；实际结果以 GitHub Actions 为准。

```bash
npm run build
npm run preview -- --open
```

上述预览也提供安全响应头。若自行部署静态站点，必须配置 COOP: same-origin、COEP: require-corp，并使用 HTTPS；本项目不默认对局域网开放。

## 结构与限制

- React + TypeScript：界面和学习流程。
- CodeMirror：Python 代码编辑。
- Pyodide + Web Worker：在浏览器中运行 Python，无系统 Python 依赖。
- SharedArrayBuffer + Atomics：同步 Python input 与异步界面输入。
- localStorage：单个作品、学习进度和快照。
- `src/projects.ts`：首批项目内容，后续可拆为独立项目配置。

这是家庭学习原型，并非运行陌生代码的安全沙箱。Worker 无法直接任意读取电脑文件，但浏览器运行环境仍可能具有网络等能力。仅运行自己或家长检查过的代码。第三方 Python 包、pygame、本机文件系统、C++、云端 AI、原生桌面打包暂不支持。

## 后续路线

1. 和孩子完成一次实际试用，调整文字、任务难度和界面。
2. 项目库：互动故事、电子宠物；增加作品管理和文件导入。
3. 可选 AI 提示与可撤回修改。
4. 评估 Tauri 桌面打包、C++ 运行和更完整的隔离方案。
