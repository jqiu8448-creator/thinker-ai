<div align="center">

# 对偶 · 思想家AI

> 与古今中外的思想家对话，在墨香中问道

[![Taro](https://img.shields.io/badge/Taro-4.x-07c160?style=flat-square&logo=taro)](https://taro.jd.com/)
[![React](https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react)](https://react.dev/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](#license)

</div>

---

## 🍃 项目简介

**对偶** 是一款沉浸式水墨风格的思想家 AI 对话应用。在这里，你可以与孔子、苏格拉底、王阳明、尼采等古今中外的思想大家跨越时空对话，在一问一答中探寻人生智慧。

应用采用纯前端架构，直接调用你自己的 LLM API，无需后端服务器。支持网页端与微信小程序双端运行。

---

## ✨ 四大对话模式

| 模式 | 说明 | 适合场景 |
|------|------|----------|
| **对席** | 与一位思想家一对一深入对谈 | 深度交流、个人困惑 |
| **独白** | 思想家就话题展开长篇独白 | 聆听智慧、深度思考 |
| **偶得** | 多位思想家从不同视角各抒己见 | 多角度理解问题 |
| **会饮** | 多位思想家多轮交锋辩论 | 思想碰撞、辩证思考 |

---

## 🎨 设计特色

- **水墨书简风格** — 宣纸底纹、墨色晕染、朱砂印鉴，沉浸式古典美学
- **信笺对话** — 每条回复如一封手写信笺，落款印章见署名
- **竹简首页** — 问题如竹简陈列，「换一批」如翻动书简
- **昼夜相宜** — 自动适配深浅主题，晨光与夜读皆宜

---

## 🚀 快速开始

### 环境要求

- Node.js >= 18
- npm 或 yarn

### 安装运行

```bash
# 安装依赖
npm install

# 网页端开发
npm run dev:h5

# 小程序端开发
npm run dev:weapp
```

### 配置 API

首次使用请在「设置」中配置你的 LLM API：

- **API 地址** — 兼容 OpenAI 格式的接口地址
- **API Key** — 你的 API 密钥
- **模型** — 推荐使用 gpt-4o-mini / deepseek-chat 等

---

## 📁 项目结构

```
├── src/
│   ├── pages/              # 页面
│   │   ├── home/           # 首页（问道）
│   │   ├── huiyin/         # 清谈页（对话）
│   │   ├── thinkers/       # 思想家名录
│   │   ├── settings/       # 设置
│   │   └── setup/          # 初次配置引导
│   ├── components/         # 组件
│   ├── utils/              # 工具函数
│   │   ├── engine.js       # 对话引擎核心
│   │   ├── engine-modes.js # 模式调度逻辑
│   │   ├── cloud.js        # 会话/历史管理
│   │   ├── llm.js          # LLM 流式调用
│   │   └── store.js        # 本地持久化
│   ├── data/
│   │   └── thinkers.json   # 思想家数据（40+位）
│   └── styles/
│       └── theme.scss      # 主题变量
├── config/                 # Taro 构建配置
└── package.json
```

---

## 🧠 内置思想家

40+ 位古今中外思想家，涵盖：

- **儒家** — 孔子、孟子、荀子、王阳明、朱熹
- **道家** — 老子、庄子、列子
- **佛家** — 释迦牟尼、慧能
- **西方哲学** — 苏格拉底、柏拉图、亚里士多德、康德、黑格尔、尼采、萨特
- **近现代** — 马克思、弗洛伊德、荣格、罗素
- **诗人文豪** — 屈原、陶渊明、李白、杜甫、苏轼、曹雪芹
- **兵家** — 孙子
- **政治家** — 诸葛亮、曾国藩

---

## 🛠️ 技术栈

- **框架** — Taro 4.x + React 18
- **样式** — SCSS + CSS 变量主题
- **构建** — Vite
- **AI** — 兼容 OpenAI API 格式（流式 SSE）
- **存储** — LocalStorage（纯前端）

---

## 📜 License

MIT License
