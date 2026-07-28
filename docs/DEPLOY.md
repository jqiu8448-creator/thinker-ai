# 托管部署指南

> 把"思想家AI"部署成公网可访问的网页，访客无需配置 API，每人每天限 3 题。

---

## 架构

```
访客浏览器
   │  HTTPS
   ▼
Render Web Service（Node.js + Express）
   ├── /                  → 静态 H5 前端（注入托管标记）
   ├── /api/hosted-config → 返回托管配置（前端识别用）
   ├── /api/quota         → 查询当前剩余配额
   ├── /api/ask           → 扣减配额（每次发问调一次）
   ├── /api/chat          → LLM 流式代理（API key 在此校验，不下发前端）
   ├── /health            → 健康检查（保活用）
   └── /feishu/webhook    → 飞书机器人回调（可选）
         │
         ▼
   你自己的 LLM API（OpenAI 兼容）
```

**关键点**：API key 只存在 Render 环境变量里，前端永远拿不到。

---

## Render 部署（推荐）

### 1. 准备 GitHub 仓库

```bash
# 本地提交所有改动
git add .
git commit -m "feat: 托管模式 + 配额管理 + Render 部署支持"
git push origin master
```

### 2. 在 Render 创建服务

1. 打开 https://render.com → 注册登录（可用 GitHub 登录）
2. **New +** → **Web Service**
3. **Connect a repository** → 选你的 GitHub 仓库 `thinker-ai`
4. 配置：
   - **Name**：`thinker-ai`（任取，会成为子域名）
   - **Region**：`Singapore`（国内访问相对友好）
   - **Runtime**：Node
   - **Branch**：`master`
   - **Build Command**：`npm install && npm run build:h5`
   - **Start Command**：`node server/index.js`
   - **Plan**：**Free**
5. **Advanced** → **Environment Variables**，添加：

   | Key | Value | 说明 |
   |-----|-------|------|
   | `LLM_BASE_URL` | `https://api.deepseek.com/v1` | 你的 LLM 接口（含 /v1） |
   | `LLM_API_KEY` | `sk-xxxxxxxx` | API key |
   | `LLM_MODEL` | `deepseek-chat` | 模型名 |
   | `DAILY_LIMIT` | `3` | 每人每天提问上限 |
   | `TZ` | `Asia/Shanghai` | 时区（决定"每日"重置时刻） |
   | `FEISHU_APP_ID` | （可选） | 接入飞书时填 |
   | `FEISHU_APP_SECRET` | （可选） | 接入飞书时填 |

6. **Create Web Service** → 等待 build 完成
7. 部署成功后，Render 会给你一个 URL，如 `https://thinker-ai.onrender.com`
8. 用浏览器打开 → 直接进入首页，无需配置 API

### 3. 配额数据持久化

Render 免费层磁盘是**临时存储**，重启会丢。配额数据默认存在 `.data/quota.json`。

**方案 A（推荐）**：接受重启丢失。Render 免费服务 15 分钟无访问会休眠，重启不频繁，配额偶尔重置问题不大。

**方案 B**：升级 Render 付费层（$7/月），加 1GB 持久磁盘，挂在 `/opt/render/project/src/.data`。代码会自动检测到磁盘并使用。

### 4. 防止休眠（可选）

免费服务 15 分钟无访问会自动休眠，下次访问需要 10-30 秒冷启动。

如果你希望它常在线：
1. 注册 https://uptimerobot.com
2. 添加监控：URL 填 `https://你的域名.onrender.com/health`，间隔 10 分钟
3. UptimeRobot 会定时 ping，服务永不休眠

> 注：飞书 webhook 场景**必须**配保活，否则 webhook 来时如果服务在睡，会超时失败。

---

## 本地测试托管模式

```bash
# 1. 安装依赖
npm install

# 2. 构建前端
npm run build:h5

# 3. 配置环境变量（在项目根目录创建 .env）
#    LLM_BASE_URL=https://api.deepseek.com/v1
#    LLM_API_KEY=sk-xxxx
#    LLM_MODEL=deepseek-chat
#    DAILY_LIMIT=3

# 4. 启动托管后端（同时 serve 前端 + 提供 API）
npm run host:start
# 或者分开：
# npm run build:h5
# npm run server:start

# 5. 打开浏览器访问 http://localhost:3000
#    设置页应该显示"托管模式"，不出现 API 配置卡片
```

---

## 验证清单

部署后逐项验证：

- [ ] `https://你的域名/health` 返回 `{"status":"ok",...}`
- [ ] `https://你的域名/api/hosted-config` 返回 `{hosted:true, dailyLimit:3, llmConfigured:true}`
- [ ] `https://你的域名/api/quota` 返回 `{ok:true, remaining:3, limit:3}`
- [ ] 打开首页 → 设置页 → 显示"托管模式 · 今日剩余 3/3 题"
- [ ] 发起一次对话 → 正常流式输出
- [ ] 再次查询配额 → 剩余 2
- [ ] 连续问 3 次后 → 第 4 次返回"今日配额已用完"
- [ ] 次日 0 点后 → 配额自动重置为 3

---

## 常见问题

### Q: 前端打开显示"后端尚未配置 LLM API"？
A: Render 环境变量没设或没生效。检查 `LLM_BASE_URL` 和 `LLM_API_KEY` 是否设置正确，重新部署一次。

### Q: 流式输出变成一次性返回？
A: 可能是 Render 反向代理缓冲了 SSE。已经在代码里加了 `X-Accel-Buffering: no` 头。如果还不行，可能是 LLM 接口本身不支持流式，会自动降级。

### Q: 配额被绕过？
A: 双绑机制下，访客清浏览器缓存 + 换 IP 才能绕过一次。对一般用户够用。要更严格的话：
- 升级 Render 付费层 + 接 Cloudflare Turnstile（人机验证）
- 或者要求手机号验证码登录（接入阿里云短信）

### Q: 想调整每天 3 题为其他数字？
A: 改 Render 环境变量 `DAILY_LIMIT` 即可，无需改代码。重启服务后生效。

### Q: 休眠后首次访问失败？
A: 飞书 webhook 场景必须配 UptimeRobot 保活。网页场景的访客会自动等待冷启动（10-30 秒），首次会慢但不失败。

---

## 文件清单

```
项目根目录
├── server/
│   ├── index.js          # Express 入口（托管 API + 静态服务 + 飞书）
│   ├── llm-proxy.js      # LLM 流式代理（API key 在此校验）
│   ├── quota-store.js    # 配额存储（IP+指纹双绑）
│   ├── feishu.js         # 飞书 API 封装（可选）
│   ├── bot.js            # 飞书机器人逻辑（可选）
│   └── session-store.js  # 飞书会话持久化（可选）
├── src/utils/
│   ├── llm.js            # 前端 LLM 客户端（托管模式分支）
│   ├── cloud.js          # 前端对话编排（托管模式扣配额）
│   ├── hosted.js         # 托管模式识别 + clientId
│   └── ...
├── dist/h5/              # 构建产物（由后端 serve）
├── .data/                # 运行时数据（配额、会话）— 已 gitignore
├── render.yaml           # Render 部署配置
├── .env.example          # 环境变量模板
└── package.json          # host:start 脚本
```
