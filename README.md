# 书房 Shufang · 把读过的书，沉淀成会生长的思考

> A reading-notes web app for people who want to think deeply over the long term: capture what an author said, what you made of it, what you decided, and let an AI coach ask the questions you would skip.

**在线体验 / Demo:** `https://<your-site>.netlify.app`（填入你的部署地址）· 登录页有“**免注册体验示例**”，不用注册就能看到预置的几本示例书（含笔记流、概念标签、AI 教练的问答示例）。
**截图 / Screenshots:** 见 `docs/screenshots/`（部署后补充，建议清单见 `docs/PROJECT_BRIEF.md`）

---

## 为什么做

大多数读书工具只做“摘录收集”：划线、导出、然后再也不看。真正有价值的是**阅读之后的思考**，以及这些想法**如何随时间变化**。书房想解决三件事：

1. 读完一章或一本书之后，**不知道该写什么、写在哪里**。
2. 笔记写完就沉底，**几个月后无法回看自己当时是怎么想的**。
3. 不同书里讨论同一件事的想法，**彼此没有连起来**。

## 核心功能

| 模块 | 说明 |
|---|---|
| **书架** | 在读 / 读完 / 想读三种完全不同的呈现；搜索书名、作者、作者国家、分类；按“开始阅读时间”“读完时间”筛选；顶部每天回看一条旧想法 |
| **一条笔记流** | 每本书一条按时间排列的笔记流，四种笔记：**摘录**（作者原话，可拍照）、**观点**（用自己的话转述，可标立场）、**思考**（我怎么看）、**行动**（可打勾） |
| **AI 教练** | 只提问、不代写。针对整本书或某一条观点追问，每个问题单独回答；会参考你过往的回答，不重复提问；可停止、可换一组 |
| **自动概念标签** | 写完笔记后 AI 建议 1–3 个概念标签，你点一下确认；优先复用已有概念，把不同书里的想法串起来 |
| **回顾** | 按概念汇集想法，并按月份展示时间线，看到同一个观点如何变化 |
| **拍照摘录** | 纸质书可拍照上传，并可用 AI 识别图中文字 |
| **导出** | Word、PDF、长图、Markdown、JSON 备份 |
| **中 / EN 双语** | 一键切换，AI 教练也会随语言切换 |
| **免注册体验示例** | 登录页一键进入示例模式：预置 3 本书和笔记、概念、教练问答；数据只存本机，AI 功能关闭，方便他人快速了解产品 |
| **邮箱登录 + 实时云端保存** | 邮箱魔法链接登录，无需密码，首次使用的邮箱自动注册；边写边保存并同步 |

## 产品设计思路（节选）

- **从 10 多个板块收成“一条笔记流”。** 早期版本有简介、核心观点、金句、思考、行动、摘录批注等十几个并列模块，使用时总要先判断“这句话该放哪”。现在只保留一条流，用**四种笔记类型**区分内容的性质：原话 → 转述 → 判断 → 行动（参考《如何阅读一本书》中“理解后再评论”的思路）。
- **教练只提问，不代写。** AI 的价值是逼你想得更深，而不是替你写；因此教练回答区永远留给用户，立场为“不同意/存疑”的观点会优先被追问依据。
- **AI 做建议，人来确认。** 概念标签是“建议 + 一键确认”，不直接改你的文字；用字数门槛、停顿触发、轻量模型控制成本；可一键关闭。
- **把设计解释从界面里拿掉。** 反复删除“功能是怎么设计的”这类说明文字，改用清晰的命名、状态提示和空状态引导。
- **先让“能长期用”成立。** 自动保存带状态提示，云端同步，导出 / 备份可迁移，数据归用户。

## 技术架构

```
Browser (single index.html, vanilla JS, no build step)
   │  Supabase JS: email magic-link auth, Postgres (RLS), Storage (private photos)
   │  fetch /.netlify/functions/ai  ──►  Netlify Function (ai.mjs)
   │                                        ├─ verifies the Supabase JWT
   │                                        ├─ checks ALLOWED_EMAILS (fails closed)
   │                                        └─ calls Anthropic Messages API (key kept server-side)
   ▼
localStorage cache (per user) + per-book last-write-wins sync
```

- **前端：** 单文件原生 JavaScript，无构建步骤；中英文通过 DOM 翻译层实现。
- **后端：** Supabase（Auth + Postgres + Storage，行级安全 RLS：每人只能读写自己的数据）。
- **AI：** Netlify Function 转发 Claude；API key 只存在服务器环境变量里；校验登录并按邮箱白名单放行。
- **同步：** 每本书一行记录，带时间戳，本地为主、云端为辅，冲突时以最近修改为准。

## 部署

1. **Supabase：** 新建项目，在 SQL Editor 运行 `supabase/schema.sql`。Authentication → URL Configuration：把 Site URL 和 Redirect URLs 设为你的网站地址。
2. **改配置：** 在 `index.html` 里把 `SB_URL` 和 `SB_KEY`（publishable key，可公开）换成你自己的。
3. **Netlify：** 连接本仓库（或把整个文件夹拖进 Deploys 页面）。在环境变量里设置 `ANTHROPIC_API_KEY` 和 `ALLOWED_EMAILS`（见 `.env.example`）。
4. 打开网站，用邮箱登录即可。

> 提示：Netlify 免费版函数默认 10 秒超时；教练提问偶尔超时的话，把 `MODEL_DEFAULT` 设为更快的模型。

## 数据与隐私

- 笔记存在你自己的 Supabase 项目里，按用户隔离（RLS）；照片存在私有存储桶，用临时签名链接访问。
- 使用 AI 功能时，相关笔记会发送给 Anthropic API 处理。
- 任何时候都可以导出 Word / PDF / Markdown / JSON 备份。

## 已知限制与路线图

- 导出的 Word / PDF 目前不含照片原图（只标注“图片摘录”）。
- PDF 由页面渲染成图片生成，文字不可选中。
- 概念页尚未支持合并同义概念。
- 同步为“最近修改优先”，同一本书多设备同时编辑可能覆盖。
- 计划：移动端体验优化、导入 Kindle 划线 / 微信读书笔记、概念图谱视图。

## 构建方式

产品设计与迭代由我主导，开发过程使用 Claude 协作完成：我负责需求、取舍和验收，反复根据真实使用反馈调整信息架构与交互。（请按你的实际情况修改这一段。）

## License

MIT

---

## English summary

**Shufang** is a reading-notes web app built around one idea: reading only pays off if your *thinking* compounds. Each book has a single time-ordered stream of four note types — **excerpt** (the author’s words, with photo capture), **argument** (the author’s claim in your own words, with your stance), **thought**, and **action**. An **AI coach asks questions but never writes for you**, an AI suggests **concept tags** you confirm so ideas link across books, and a **review page** shows how your thinking on a concept changes over time.

Stack: vanilla JS single page, Supabase (email magic-link auth, Postgres with RLS, private Storage), a Netlify Function that proxies the Anthropic API (JWT-verified, email-allowlisted, key never exposed), bilingual UI (中 / EN), exports to Word / PDF / image / Markdown.
