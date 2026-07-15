# 思想家 AI · 网页版（开源）

与百位中外思想家对话的 AI 应用。**纯前端实现**：所有对话逻辑、历史记录都运行在浏览器内，
直接调用**你自己的 OpenAI 兼容接口**，无需任何后端服务器，也无需云账号/小程序发布资质。

> 首次打开会要求填写你自己的 API 接口（Base URL + API Key + 模型名），配置仅保存在本机浏览器，不会上传任何服务器。

## 特性

- **四种对话方式**：对席（单人深度长谈）、独白（思想家长文）、偶得（多位先贤多视角点拨）、会饮（群贤观点交锋辩论）
- **136 位思想家**：孔子、庄子、苏轼、王阳明、尼采、弗洛伊德、鲁迅……每位带完整人格档案
- **智能引荐**：描述你的困惑，自动匹配最适合对话的几位思想家
- **本地历史**：对话记录、收藏、标签均保存在浏览器本地（localStorage）
- **流式输出**：对席 / 独白模式下思想家逐字「打字机」式作答；不支持流式的接口会自动降级为整段返回
- **零后端**：克隆即可运行，可部署到 GitHub Pages 等任意静态托管

## 技术栈

- [Taro](https://taro.zone/) 4.x（React）+ H5 构建 → 静态站点
- 哈希路由 + 相对路径，可直接部署在任意子路径下
- 思想家档案与对话引擎打包为静态 JSON（`taro-app/src/data/thinkers.json`）

## 快速开始

### 方式一：本地开发预览

```bash
cd taro-app
npm install
npm run dev:h5
# 打开终端提示的地址（默认 http://localhost:10086 ）
```

### 方式二：构建静态站点并部署

```bash
cd taro-app
npm install
npm run build:h5      # 产物输出到 taro-app/dist
npm run preview       # 本地以静态服务预览 dist（npx serve dist）
```

将 `taro-app/dist` 整个目录上传到任意静态托管即可（GitHub Pages / Vercel / Netlify / Nginx …）。
因为使用了哈希路由与相对路径，放到仓库子路径（如 `用户名.github.io/仓库名/`）也能直接打开。

### 首次使用

打开网页后，会进入「配置接口」页：

1. **Base URL**：你的 OpenAI 兼容接口地址，需包含 `/v1`，例如 `https://api.deepseek.com/v1`
2. **API Key**：你的接口密钥（如 `sk-...`）
3. **模型名**：如 `deepseek-chat`、`gpt-3.5-turbo`、`qwen-max` 等
4. 点击「测试连接」验证，再「保存并进入」

之后即可在首页描述话题，开始与思想家对话。配置可随时在「设置 → AI 接口」中修改。

## 目录说明

```
taro-app/                网页应用（Taro React + H5）
  src/
    pages/               首页 / 对话 / 会饮 / 思想家 / 设置 / 首次配置
    utils/
      engine.js          对话引擎（人格生成、引荐、多思想家辩论）
      llm.js             浏览器内直连 OpenAI 兼容接口的客户端
      store.js           浏览器本地存储（会话 / 历史 / 设置）
      cloud.js           统一的本地调用封装（替代原后端）
      api-config.js      用户自有 API 配置（localStorage）
    data/thinkers.json   思想家档案与话题表（由脚本生成）
  config/index.js        H5 构建配置（哈希路由 + 相对路径）
scripts/build-thinkers.js  由 server 档案源生成 thinkers.json
server/                 思想家档案源（Markdown）与可选的旧版 Node 后端（仅供数据生成参考）
```

## 重新生成思想家数据（可选）

如果你想修改思想家档案后重新打包，需保留 `server/` 目录：

```bash
npm run build:data       # = node scripts/build-thinkers.js
```

该脚本读取 `server/data/thinker_profiles` 下的 SKILL.md 与话题速查表，输出 `taro-app/src/data/thinkers.json`。
`thinkers.json` 已随仓库提交，正常情况下无需重新生成。

## 注意事项

- **CORS（跨域）**：网页直接调用你的接口时，接口服务端需允许当前网页来源的跨域请求（响应头 `Access-Control-Allow-Origin`）。部分厂商（如 OpenAI 官方）默认不允许浏览器直连，可选方案：
  - 使用允许浏览器跨域的兼容服务（如 OpenRouter、本地模型 Ollama 开启 CORS、或自建反代）；
  - 或部署一个允许 CORS 的小代理，把 Base URL 指向它。
- 你的 API Key 仅保存在使用者的浏览器本地，请自行保管，不要泄露。
- 对话内容由你配置的模型生成，请注意甄别。

## 说明

- 本项目为前端开源版本，不依赖任何云端服务；原来的微信小程序与云函数代码未纳入本仓库。
- 你的 API Key 仅保存在使用者的浏览器本地，请自行保管。
- 对话内容由你配置的模型生成，请注意甄别。
