# BrowseBuddy

> AI 驱动的浏览器自动化扩展，面向表单填充、流程录制和自然语言页面操控场景。

BrowseBuddy 把"页面理解 + 智能填充 + 操作录制 + 对话控制"串成一个浏览器自动化闭环：用户打开任意网页后，扩展自动提取页面结构，通过侧边栏对话即可用自然语言指挥 AI 填写表单、点击按钮、录制和回放操作流程。

## English Overview

BrowseBuddy is a Chrome extension that combines AI-powered page understanding with browser automation. It extracts page structure in real time, lets users fill forms via natural language, records browser workflows for replay, and supports multiple AI providers (OpenAI, Anthropic, DeepSeek, Ollama, and any OpenAI-compatible API).

## 这个项目解决什么问题

日常浏览中经常遇到重复性的表单填写和页面操作：

- 测试环境需要反复填写注册/登录表单，每次手动输入费时费力。
- 运营人员需要在后台系统中重复执行相同的点击、填写、提交流程。
- 遇到复杂表单时，不确定每个字段应该填什么格式的数据。
- 想用 AI 辅助操作页面，但现有工具要么需要写代码，要么无法理解页面上下文。

BrowseBuddy 的目标是让用户用一句话就能完成这些操作，不需要写脚本，不需要学 API。

<img width="780" height="1914" alt="image" src="https://github.com/user-attachments/assets/28ccb145-f144-46f2-998e-8c19cefdfb99" />


## 核心功能

| 功能 | 说明 |
| --- | --- |
| 智能表单填充 | 用自然语言描述需求（如"用随机中文数据填充注册表单"），AI 自动识别字段并填入合适的值。 |
| 页面上下文感知 | 自动提取当前页面的表单、按钮、标题等结构信息，AI 能准确理解页面内容。 |
| 多页面切换 | 侧边栏支持连接不同 Tab 页面，每个页面独立维护对话历史。 |
| 操作流程录制 | 录制用户的点击、输入、选择等操作，生成可编辑的 JSON 脚本。 |
| 流程回放 | 一键回放录制的操作流程，支持参数化变量替换。 |
| AI 对话 | 侧边栏对话界面，支持多轮对话，AI 理解页面并执行操作。 |
| 多 Provider 支持 | 支持 OpenAI、Anthropic、DeepSeek、Ollama 等任意 OpenAI 兼容 API。 |
| 自定义 Base URL | 每个 Provider 可配置独立的 API 地址，适配各种私有部署和代理。 |

## 使用流程

### 1. 配置 AI Provider

点击工具栏 BrowseBuddy 图标 → 在 Popup 中添加 Provider → 填写名称、API 地址、API Key → 点击 Test Connection 验证 → Save。

默认预置 OpenAI 和 Anthropic 两个 Provider，支持添加 DeepSeek、Ollama 等任意 OpenAI 兼容服务。

### 2. 智能填充表单

1. 打开目标页面，确认侧边栏显示"Page connected"（绿色状态）。
2. 在对话框输入指令，例如：
   - "帮我填充这个表单"
   - "用随机英文数据填写所有字段"
   - "在姓名栏填张三，邮箱填 test@example.com"
3. AI 分析页面结构，生成填充数据，自动填入表单字段。
4. 已填充字段会绿色高亮闪烁，侧边栏显示填充结果统计。

### 3. 录制和回放流程

1. 切换到侧边栏"Workflows"标签 → 点击 Start Recording。
2. 在页面上正常操作（点击、输入、选择等），操作会被实时记录。
3. 点击 Stop Recording → 命名并保存流程脚本。
4. 随时点击 Replay 回放，支持导出为 JSON 文件。

### 4. 多页面对话

- 点击侧边栏页面连接区域的网格图标，切换到不同 Tab 页面。
- 每个页面独立维护对话历史，切回时自动恢复。
- 点击刷新按钮重新获取页面最新内容。
- 点击垃圾桶图标清空当前页面的对话历史。

## 支持的字段类型

| 类型 | 支持情况 |
| --- | --- |
| 文本输入（text, email, tel, url...） | ✅ 完整支持，兼容 React/Vue 等框架 |
| 文本域（textarea） | ✅ 完整支持 |
| 下拉选择（select） | ✅ 精确匹配 + 模糊匹配 + 数字索引 |
| 单选框（radio） | ✅ 按标签文本或 value 匹配选中 |
| 复选框（checkbox） | ✅ 支持 true/false 和标签文本匹配 |
| 自定义下拉组件 | ✅ 支持 role=listbox 等 ARIA 组件 |
| contenteditable | ✅ 支持 |

## 技术栈

| 层级 | 技术 |
| --- | --- |
| UI 框架 | React 18 + Tailwind CSS |
| 语言 | TypeScript |
| 构建 | Vite 6 |
| 扩展平台 | Chrome Extension Manifest V3 |
| AI 接口 | OpenAI Compatible API / Anthropic API |
| 存储 | chrome.storage.local |

## 架构

```
src/
├── popup/          # Provider 配置管理 UI（API Key、Base URL）
├── sidepanel/      # 主交互界面（对话、流程管理、页面切换）
├── background/     # Service Worker（消息路由、AI API 调用）
├── content/        # Content Script（页面提取、表单填充、录制回放）
├── shared/         # 共享类型定义和消息协议
└── ai/             # AI Provider 适配器和 Prompt 模板
    └── providers/  # OpenAI Compatible / Anthropic 两种协议
```

### 消息流

```
用户输入 → Side Panel → Background SW → AI API
                                          ↓
页面填充 ← Content Script ← Side Panel ← AI 响应
```

## 安装

### 从源码构建

```bash
git clone https://github.com/gleikeen/BrowseBuddy.git
cd BrowseBuddy
npm install
npm run build
```

在 Chrome 中加载：

1. 打开 `chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择项目的 `dist/` 目录

### 开发

```bash
npm run dev     # 监听模式，文件变更自动重新构建
npm run build   # 生产构建
```

修改代码后，在 `chrome://extensions/` 页面点击扩展卡片上的刷新按钮即可加载最新代码。

## 数据与隐私

- API Key 仅存储在 `chrome.storage.local`，不会上传到任何第三方服务器。
- 所有 AI 请求从浏览器直接发往用户配置的 API 端点。
- Content Script 无法访问 API Key，所有密钥操作在 Popup 中完成。
- 流程脚本存储在本地 `chrome.storage.local`，支持导出备份。
- 对话历史仅保存在内存中，关闭扩展即清除。

## 开源说明

这个仓库公开以下内容：

- Chrome Extension Manifest V3 的 Side Panel + Content Script + Background SW 架构实践
- AI 驱动的页面上下文提取和表单自动填充方案
- 多 AI Provider 适配（OpenAI Compatible / Anthropic）
- 浏览器操作录制与回放引擎

如果你也在做浏览器自动化、AI 辅助填表、Chrome 扩展开发或 LLM 应用集成，欢迎提交 Issue 或 PR。

项目采用 [MIT License](LICENSE)。
