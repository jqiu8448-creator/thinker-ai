---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: c995c15d06d7866d66c4ae9884fddcf5_75365171806311f1b7a1525400826444
    ReservedCode1: XYUobr+ubx6cDaZBoSG9i+TEt2VeLEIWZFTfAJNea8yIneyPDi1YLNx914p3ZCZRmA6zBWS8dEBJwQzLaZBlCnGFtH6xGmGnPn2Ipw5XtW1xwOjOAIJOqXHQDz5345JaQC1jf7tFy3kJLWbuNJB6QI7YC3aHP5QjMNBCB5PcVVsHjHEDdK64QG5nZN4=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: c995c15d06d7866d66c4ae9884fddcf5_75365171806311f1b7a1525400826444
    ReservedCode2: XYUobr+ubx6cDaZBoSG9i+TEt2VeLEIWZFTfAJNea8yIneyPDi1YLNx914p3ZCZRmA6zBWS8dEBJwQzLaZBlCnGFtH6xGmGnPn2Ipw5XtW1xwOjOAIJOqXHQDz5345JaQC1jf7tFy3kJLWbuNJB6QI7YC3aHP5QjMNBCB5PcVVsHjHEDdK64QG5nZN4=
---

# 前端（网页端）交接说明

## 源码目录

重点看这个目录：

```
taro-app/src/
```

## 结构速览

| 路径 | 说明 |
|------|------|
| `src/app.scss` / `src/styles/theme.scss` | 全局布局 + 主题变量（当前是「宣纸/墨/朱砂」配色，改这里能换肤） |
| `src/components/tabbar/` | 左侧栏（印章 logo + 导航 + 最近对话） |
| `src/pages/home/` | 首页（名言/推荐问题/推荐思想家） |
| `src/pages/chat/` | 对话页（流式输出） |
| `src/pages/thinkers/` `settings/` `huiyin/` `setup/` | 其余页面 |
| `src/utils/` | llm.js（流式）、engine.js、cloud.js、store.js（本地会话）、fit-viewport.js（桌面字号） |
| `src/data/thinkers.json` | 136 位思想家数据（含 quote / tagline / brief，可用作填充内容） |

## 构建产物

预览服务器实际托管的静态站：

```
taro-app/dist/
```

## 命令与环境

- **框架**：Taro 4 + React + Vite，H5 构建（网页端是纯前端，浏览器直连用户自己的 API）
- **重新构建**：`cd taro-app && npm run build:h5`
- **当前预览服务**：已在运行，`http://127.0.0.1:8088/`（Python http.server，根目录指向 `taro-app/dist`）
- **路由**：hash 模式，入口 `src/app.jsx`
- **适配**：桌面端仅优化 ≥768px、全宽 + 左栏，手机端未做适配

## 开发流程

1. 直接改 `taro-app/src/` 下的源码
2. 运行 `npm run build:h5` 重新构建
3. 刷新 `http://127.0.0.1:8088/` 即可看效果
*（内容由AI生成，仅供参考）*
