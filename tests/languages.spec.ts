import { test, expect, type Page } from '@playwright/test';
import { catalog } from '../src/catalog';
async function open(page: Page, title: string, language: string, problems = false) {
  await page.getByRole('button', { name: '项目与题库', exact: true }).click();
  if (problems) await page.getByRole('button', { name: '算法练习 · 8' }).click();
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  await card.getByRole('button', { name: `${language} 开始`, exact: true }).click();
}
async function code(page: Page, value: string, language: string) {
  await page.getByRole('textbox', { name: `${language} 代码编辑器` }).click();
  await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.insertText(value);
}
test('old save migrates and each project/language keeps its own code', async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('little-maker-v1')) localStorage.setItem('little-maker-v1', JSON.stringify({ code: 'print("旧作品")', title: '以前的秘密数字', step: 2, completed: [0, 1], versions: [] })); });
  await page.goto('/');
  await expect(page.getByLabel('Python 代码编辑器')).toContainText('旧作品');
  await expect(page.getByLabel('作品名称')).toHaveValue('以前的秘密数字');
  await open(page, '班级积分统计器', 'Python');
  await code(page, 'print("我的 Python")', 'Python');
  await page.getByRole('button', { name: 'C++', exact: true }).click();
  await expect(page.getByLabel('C++ 代码编辑器')).not.toContainText('我的 Python');
  await code(page, '#include <iostream>\nint main(){ std::cout << 42; }', 'C++');
  await page.getByRole('button', { name: 'Python', exact: true }).click();
  await expect(page.getByLabel('Python 代码编辑器')).toContainText('我的 Python');
  await open(page, '我的秘密数字', 'Python');
  await expect(page.getByLabel('Python 代码编辑器')).toContainText('旧作品');
  await expect(page.getByRole('navigation')).toContainText('✓');
});
test('C++ project compiles, runs and reports syntax errors; can stop and run again', async ({ page }) => {
  await page.goto('/'); await open(page, '星星图案工坊', 'C++');
  await page.getByRole('button', { name: '检查 C++ 环境' }).click();
  await expect(page.getByRole('note')).toContainText(/clang|g\+\+|GCC/i, { timeout: 20000 });
  await page.getByLabel('输入数据').fill('3\n');
  await page.getByRole('button', { name: '▶ 运行作品' }).click();
  await expect(page.getByLabel('运行输出')).toContainText('*\n**\n***', { timeout: 30000 });
  await code(page, 'int main() { broken }', 'C++');
  await page.getByRole('button', { name: '▶ 运行作品' }).click();
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 30000 });
  await code(page, 'int main(){ while(true){} }', 'C++');
  await page.getByRole('button', { name: '▶ 运行作品' }).click();
  await page.getByRole('button', { name: '■ 停止' }).click();
  await expect(page.getByRole('status')).toContainText('已停止');
  await code(page, '#include <iostream>\nint main(){std::cout << "你好，C++";}', 'C++');
  await page.getByRole('button', { name: '▶ 运行作品' }).click();
  await expect(page.getByLabel('运行输出')).toContainText('你好，C++', { timeout: 30000 });
});
test('algorithm judge distinguishes wrong output, EOF, timeout and correct solution in both languages', async ({ page }) => {
  await page.goto('/'); await open(page, '01 · 台阶上的金币', 'Python', true);
  await page.getByRole('button', { name: /提交测试/ }).click();
  await expect(page.getByRole('status').first()).toContainText('0 / 4 通过', { timeout: 60000 });
  await expect(page.getByText('1. 样例 · 答案不同', { exact: false })).toBeVisible();
  await code(page, 'n = int(input())\nprint(sum(range(1, n + 1)))', 'Python');
  await page.getByRole('button', { name: /提交测试/ }).click();
  await expect(page.getByRole('status').first()).toContainText('4 / 4 通过', { timeout: 60000 });
  await code(page, 'input()\ninput()', 'Python');
  await page.getByRole('button', { name: '▶ 运行作品' }).click();
  await expect(page.getByRole('alert')).toContainText('输入数据用完', { timeout: 15000 });
  await code(page, 'while True:\n    pass', 'Python');
  await page.getByRole('button', { name: '▶ 运行作品' }).click();
  await expect(page.getByRole('status').first()).toContainText('运行超时', { timeout: 15000 });
  await page.getByRole('button', { name: 'C++', exact: true }).click();
  await code(page, '#include <iostream>\nint main(){long long n;std::cin>>n;std::cout<<n*(n+1)/2;}', 'C++');
  await page.getByRole('button', { name: /提交测试/ }).click();
  await expect(page.getByRole('status').first()).toContainText('4 / 4 通过', { timeout: 30000 });
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '导出 .cpp' }).click();
  expect((await download).suggestedFilename()).toBe('我的作品.cpp');
});
test('native endpoint rejects cross-site and oversized requests; bounds execution', async ({ request }) => {
  const headers = { 'X-Little-Maker': 'local-workshop' };
  expect((await request.post('/api/cpp', { data: { code: '', inputs: [''] } })).status()).toBe(403);
  expect((await request.post('/api/cpp', { headers: { ...headers, Origin: 'https://example.com' }, data: { code: '', inputs: [''] } })).status()).toBe(403);
  expect((await request.post('/api/cpp', { headers, data: { code: 'x'.repeat(50001), inputs: [''] } })).status()).toBe(400);
  const timeout = await request.post('/api/cpp', { headers, data: { code: 'int main(){while(true){}}', inputs: [''] } });
  expect((await timeout.json()).results[0].timedOut).toBe(true);
  const flood = await request.post('/api/cpp', { headers, data: { code: '#include <iostream>\nint main(){while(true)std::cout << "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";}', inputs: [''] } });
  expect((await flood.json()).results[0].error).toContain('输出超过限制');
});
const solutions: Record<string, { python: string; cpp: string }> = {
  sum: { python: 'n=int(input())\nprint(n*(n+1)//2)', cpp: 'long long n;cin>>n;cout<<n*(n+1)/2;' },
  digits: { python: 'print(sum(map(int,input().strip())))', cpp: 'long long n;cin>>n;int s=0;while(n){s+=n%10;n/=10;}cout<<s;' },
  sevens: { python: 'n=int(input())\nprint(sum(i%7==0 or "7" in str(i) for i in range(1,n+1)))', cpp: 'int n,c=0;cin>>n;for(int i=1;i<=n;i++)if(i%7==0||to_string(i).find(\'7\')!=string::npos)c++;cout<<c;' },
  prime: { python: 'n=int(input())\nprint("YES" if n>1 and all(n%d for d in range(2,int(n**0.5)+1)) else "NO")', cpp: 'int n;cin>>n;bool p=n>1;for(int d=2;d*d<=n;d++)if(n%d==0)p=false;cout<<(p?"YES":"NO");' },
  gcd: { python: 'import math\na,b=map(int,input().split())\nprint(math.gcd(a,b))', cpp: 'long long a,b;cin>>a>>b;while(b){auto r=a%b;a=b;b=r;}cout<<a;' },
  scores: { python: 'n=int(input())\na=list(map(int,input().split()))\nprint(max(a),min(a),sum(a))', cpp: 'int n,x,lo=101,hi=-1,s=0;cin>>n;while(n--){cin>>x;lo=min(lo,x);hi=max(hi,x);s+=x;}cout<<hi<<" "<<lo<<" "<<s;' },
  sorting: { python: 'input()\nprint(*sorted(map(int,input().split())))', cpp: 'int n;cin>>n;vector<int>a(n);for(auto &x:a)cin>>x;sort(a.begin(),a.end());for(int x:a)cout<<x<<" ";' },
  prefix: { python: 'n,q=map(int,input().split())\na=list(map(int,input().split()))\np=[0]\nfor x in a:p.append(p[-1]+x)\nfor _ in range(q):\n l,r=map(int,input().split());print(p[r]-p[l-1])', cpp: 'int n,q;cin>>n>>q;vector<int>p(n+1);for(int i=1,x;i<=n;i++){cin>>x;p[i]=p[i-1]+x;}while(q--){int l,r;cin>>l>>r;cout<<p[r]-p[l-1]<<"\\n";}' },
};
for (const unit of catalog.filter(item => item.kind === 'problem')) {
  test(`${unit.id}: all published cases accept reference Python and C++ solutions`, async ({ page, request }) => {
    const solution = solutions[unit.id];
    const response = await request.post('/api/cpp', { headers: { 'X-Little-Maker': 'local-workshop' }, data: { code: '#include <iostream>\n#include <vector>\n#include <algorithm>\n#include <string>\nusing namespace std;int main(){' + solution.cpp + '}', inputs: unit.cases!.map(c => c.input) } });
    const result = await response.json(); expect(result.compileError || result.error).toBeUndefined();
    result.results.forEach((item: { output: string; exitCode: number }, i: number) => { expect(item.exitCode).toBe(0); expect(item.output.trim().split(/\s+/)).toEqual(unit.cases![i].output.trim().split(/\s+/)); });
    await page.goto('/'); await open(page, unit.title, 'Python', true); await code(page, solution.python, 'Python');
    await page.getByRole('button', { name: /提交测试/ }).click();
    await expect(page.getByRole('status').first()).toContainText(`${unit.cases!.length} / ${unit.cases!.length} 通过`, { timeout: 60000 });
  });
}
