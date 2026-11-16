export const starter = `import random

secret = random.randint(1, 20)
guess = 0

while guess != secret:
    guess = int(input("你猜是多少？"))

    if guess < secret:
        print("猜小啦！")
    elif guess > secret:
        print("猜大啦！")
    else:
        print("猜中了！")
`;
export const challenges = [
  { title: '先玩一遍，再改改难度', tag: '循环 · 随机数', goal: '运行游戏，试着猜中秘密数字。然后把数字范围改成 1～50，并告诉玩家新的范围。', checks: ['我完整玩过一遍游戏', '我把范围改成了 1～50', '玩家能从提示中知道数字范围'], hints: ['秘密数字是在 random.randint 这一行产生的。两个数字分别表示什么？', '把 randint(1, 20) 中的 20 改成 50。别忘记修改输入提示。', '可以写成 secret = random.randint(1, 50)，再把提示改成“猜一个 1～50 的数字：”。'], reflection: '如果把两个边界都改成 10，会发生什么？' },
  { title: '记录我猜了几次', tag: '变量 · 累加', goal: '增加一个计数器。每猜一次，就显示这是第几次猜测。', checks: ['第一次猜测显示 1', '连续猜三次会显示 3', '我知道计数器为什么要在循环外初始化'], hints: ['用一个变量保存次数。它的初始值应该是多少？', '在 while 前写 attempts = 0。收到一次输入后，把次数加 1。', '在循环内加上 attempts = attempts + 1 和 print("这是第", attempts, "次猜测")。注意缩进。'], reflection: '如果 attempts = 0 放在循环里面，结果会怎样？' },
  { title: '只有五次机会', tag: '条件 · 循环结束', goal: '最多允许猜五次。猜中就结束；机会用完时，告诉玩家秘密数字。', checks: ['猜中后会结束', '猜错五次后会结束', '失败后能看到正确答案'], hints: ['循环除了“还没猜中”，还要满足什么条件？', '可以用 and 同时检查两个条件：guess != secret and attempts < 5。', '循环结束后，用 if guess != secret: 判断是否失败，并打印 secret。'], reflection: '怎样测试“第五次刚好猜中”的情况？可以暂时把 secret 设成固定数字。' },
  { title: '让游戏更结实', tag: '新工具 · 异常处理', goal: '试着输入字母或空内容。让程序友好提示，而不是直接报错。你可以在提示中学习 try / except。', checks: ['输入文字不会让程序退出', '空输入也能得到提示', '输入数字后仍然可以正常玩'], hints: ['int("你好") 无法变成整数，会产生 ValueError。这次我们学习捕获它。', '把转换输入的语句放在 try: 下面；用 except ValueError: 处理转换失败。', '示例：\ntry:\n    guess = int(input("你猜是多少？"))\nexcept ValueError:\n    print("请输入整数哦")\n    continue\n这些语句放在 while 内，还要增加一层缩进。'], reflection: '输错内容要不要消耗机会？由你决定，再测试它。' },
  { title: '做出你的特别版', tag: '自由创作', goal: '给作品起一个名字，再增加你自己的规则：难度选择、再玩一次，或者更有趣的提示。', checks: ['我增加了自己的功能', '我测试过它确实按预期运行', '我能解释一段关键代码'], hints: ['先用一句话描述新功能：当……时，程序应该……。', '一次只加一个小功能。先保存版本，改完马上运行。', '可以先加一个简单功能：猜中时，根据次数显示不同的称号。'], reflection: '把你的作品演示给家人：你最满意的改动是什么？' },
];
