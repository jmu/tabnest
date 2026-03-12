# TabNest

智能 Chrome 标签页分组扩展 - 基于 URL 层级结构、时间线和内容理解。

## 功能概述

### 核心功能

| 功能 | 说明 |
|------|------|
| **Group All Tabs** | 将所有浏览器窗口中的标签页按 URL 规则分组 |
| **Group Current Window** | 仅对当前窗口的标签页进行分组 |
| **Group by Timeline** | 按标签页打开时间顺序分组 |
| **Ungroup All** | 解散所有标签页分组 |
| **Auto-group** | 新标签页自动加入匹配的现有分组 |

### 分组策略

#### 1. URL 层级分组

根据 URL 路径结构智能分组：

**代码托管站点** (GitHub, GitLab, Gitee, Bitbucket, Codeberg)
- `github.com/owner/repo/*` → 分组为 `github.com/owner/repo`
- 同一项目的所有页面归为一组

**文档站点** (MDN, Notion, Read the Docs 等)
- `docs.python.org/3/library/*` → 分组为 `docs.python.org/3`
- `developer.mozilla.org/en-US/docs/Web/*` → 分组为 `developer.mozilla.org/en-US`

**普通站点**
- 默认按域名分组，如 `google.com`、`stackoverflow.com`

#### 2. 时间线分组 (Timeline Grouping)

按标签页打开时间分组，捕捉用户的浏览轨迹：

- 记录每个标签页的创建时间
- 相邻标签页时间差 < 阈值（默认 5 分钟）则归为同一组
- 组名显示为时间范围，如 `14:00-14:25`

**适用场景：**
- 研究某个主题时连续打开的多个标签页
- 工作时间段的浏览记录
- 按会话回顾浏览历史

#### 3. 自动分组

启用后，新打开的标签页会：
1. 分析 URL 确定分组 key
2. 查找同窗口内是否有匹配的现有分组
3. 如有，自动加入该分组
4. 如无，检查是否有其他相似标签页，一起创建新分组

---

## 技术实现

### 架构

```
┌─────────────────────────────────────────────────────────┐
│                    Manifest V3                          │
├─────────────────────────────────────────────────────────┤
│  popup.html/js     │  options.html/js                  │
│  (用户交互界面)     │  (设置页面)                        │
├─────────────────────────────────────────────────────────┤
│                    background.js                        │
│                    (Service Worker)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ 消息处理     │  │ 分组引擎     │  │ 自动分组     │  │
│  │ onMessage    │  │ analyzeAnd   │  │ onUpdated    │  │
│  │              │  │ Group        │  │              │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
├─────────────────────────────────────────────────────────┤
│                    Chrome APIs                          │
│  chrome.tabs │ chrome.tabGroups │ chrome.storage       │
└─────────────────────────────────────────────────────────┘
```

### 文件结构

```
tabnest/
├── manifest.json      # 扩展配置
├── background.js      # Service Worker - 核心分组逻辑
├── popup.html         # 弹窗界面
├── popup.js           # 弹窗交互逻辑
├── popup.css          # 弹窗样式
├── options.html       # 设置页面
├── options.js         # 设置保存/加载
├── README.md          # 本文档
└── icons/             # 扩展图标
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

### 关键函数

#### background.js

| 函数 | 功能 |
|------|------|
| `groupCurrentWindow()` | 分组当前窗口所有标签页 |
| `groupAllWindows()` | 分组所有窗口的标签页 |
| `groupByTimeline(windowId)` | 按时间线分组标签页 |
| `analyzeAndGroup(tabs)` | 分析标签页并返回分组映射 |
| `getGroupKey(tab, settings)` | 根据策略计算标签页的分组 key |
| `autoGroupTab(tab)` | 自动将新标签页加入合适分组 |
| `parseUrl(url)` | 解析 URL 为 domain + pathSegments |
| `isCodeHostingSite(domain)` | 判断是否为代码托管站点 |
| `isDocsSite(domain)` | 判断是否为文档站点 |
| `getGroupColor(groupKey)` | 根据分组 key 生成一致的颜色 |
| `formatTimeRange(start, end)` | 格式化时间范围为分组标题 |

### 分组流程

```
用户点击 "Group All Tabs"
        │
        ▼
┌───────────────────┐
│ 获取所有标签页     │
│ chrome.tabs.query │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ 按窗口分组         │
│ (Chrome 分组必须   │
│  在同一窗口内)     │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ 对每个窗口:        │
│ 1. 解散现有分组    │
│ 2. analyzeAndGroup│
│ 3. createGroups   │
└─────────┬─────────┘
          │
          ▼
      分组完成
```

### getGroupKey 决策逻辑

```
getGroupKey(tab, settings)
        │
        ▼
┌─────────────────────┐
│ parseUrl(tab.url)   │
│ 获取 domain, path   │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐     否
│ URL层级启用?        │─────────────┐
└─────────┬───────────┘             │
          │ 是                       │
          ▼                         │
┌─────────────────────┐             │
│ 是代码托管站点?      │             │
│ (github/gitlab等)   │             │
└─────────┬───────────┘             │
          │ 是                       │
          ▼                         │
┌─────────────────────┐             │
│ 返回:               │             │
│ domain/owner/repo   │             │
└─────────────────────┘             │
                                    │
          ┌─────────────────────────┘
          │
          ▼
┌─────────────────────┐
│ 是文档站点?          │
│ (MDN, Notion等)     │
└─────────┬───────────┘
          │ 是
          ▼
┌─────────────────────┐
│ 返回:               │
│ domain/第一级路径    │
└─────────────────────┘
          │ 否
          ▼
┌─────────────────────┐
│ 返回: domain        │
└─────────────────────┘
```

---

## 配置选项

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `useUrlHierarchy` | `true` | 启用 URL 层级分组策略 |
| `useContentAnalysis` | `false` | 内容分析（实验性，暂未实现） |
| `autoGroup` | `false` | 新标签页自动分组 |
| `timelineThreshold` | `5` | 时间线分组阈值（分钟），相邻标签页时间差小于此值则归为同一组 |
| `llmEnabled` | `false` | 启用 AI 辅助分组（实验性） |
| `llmApiKey` | `''` | OpenAI API Key |
| `llmApiUrl` | `https://api.openai.com/v1/chat/completions` | LLM API 端点 |
| `llmModel` | `gpt-4o-mini` | 使用的模型 |

---

## 支持的站点

### 代码托管站点

- github.com
- gitlab.com
- bitbucket.org
- gitee.com
- codeberg.org

### 文档站点

- docs.google.com
- notion.so
- atlassian.net / atlassian.com
- readthedocs.io
- docs.python.org
- developer.mozilla.org
- react.dev
- vuejs.org
- tailwindcss.com

---

## 安装使用

### 开发模式

1. 下载或克隆本项目
2. 打开 Chrome，访问 `chrome://extensions/`
3. 开启右上角"开发者模式"
4. 点击"加载已解压的扩展程序"，选择 `tabnest` 目录

### 打包发布

```bash
# 创建发布包
zip -r tabnest-v1.0.2.zip manifest.json *.html *.js *.css icons/
```

---

## 限制与已知问题

1. **分组必须在同一窗口** - Chrome API 限制，跨窗口分组不支持
2. **特殊页面跳过** - `chrome://` 和 `chrome-extension://` 页面不参与分组
3. **颜色一致性** - 基于分组 key 哈希生成，保证同一站点颜色一致
4. **分组标题长度** - 最长 25 字符，超长截断

---

## 未来计划

- [ ] 内容分析分组（读取页面 title/content）
- [ ] LLM 智能分组（调用 AI API 分析语义）
- [ ] 分组规则自定义（用户定义正则匹配）
- [ ] 分组历史记录
- [ ] 导出/导入分组配置
- [ ] Firefox 支持

---

## 许可证

MIT