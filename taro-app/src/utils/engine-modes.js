// 对话模式 / 状态机常量（移植自 server/config.js）
export const AI_MODEL = 'gpt-3.5-turbo'; // 自定义接口下以用户填写为准，此值仅作兜底

export const MODES = {
  duixi: {
    key: 'duixi',
    name: '对席',
    desc: '单人深度对话，1500-2000字深入阐述',
    firstReplyMin: 1500,
    firstReplyMax: 2000,
    subsequentMax: 300,
    temperature: 0.8,
    maxTokens: 3000,
  },
  oude: {
    key: 'oude',
    name: '偶得',
    desc: '多视角探索，每位300字精炼表达',
    perThinkerMax: 300,
    temperature: 0.7,
    maxTokens: 800,
  },
  huiyin: {
    key: 'huiyin',
    name: '会饮',
    desc: '多位思想家辩论，150-200字观点碰撞',
    rounds: [150, 200, 200],
    temperature: 0.75,
    maxTokens: 500,
  },
  dubai: {
    key: 'dubai',
    name: '独白',
    desc: '思想家长篇独白，800-1200字沉浸式长文',
    firstReplyMin: 800,
    firstReplyMax: 1200,
    subsequentMax: 200,
    temperature: 0.85,
    maxTokens: 2500,
  },
};

export const MODE_MENU = `1. 对席 — 单人深度对话，1500-2000字深入阐述
2. 偶得 — 多视角探索，每位300字精炼表达
3. 会饮 — 多位思想家辩论，150-200字观点碰撞
4. 独白 — 思想家长篇独白，800-1200字沉浸式长文`;

export const STATES = {
  idle: 'idle',
  waiting_thinker: 'waiting_thinker',
  waiting_mode: 'waiting_mode',
  in_conversation: 'in_conversation',
};

export const UNIVERSAL_NAMES = [
  '王阳明', '曾国藩', '苏轼', '尼采', '弗洛伊德', '荣格', '庄子', '鲁迅',
  '史铁生', '尤瓦尔·赫拉利', '孔子', '伏尔泰', '马克思', '褚时健',
];

// 各模式 system prompt 片段（移植自 server/lib/thinker.js）
export const MODE_PROMPTS = {
  duixi: () => `## 当前模式：对席（单人深度对话）

你正在与用户进行一对一的深度对话。
- 首次回复：1500-2000字，深入阐述你的观点，结合你的生平经历和核心思想
- 后续回复：正常对话节奏（1-4句），但要保持深度
- 讲透观点优先，不注水不草率

用户可能的问题或困惑，用你的思想体系来回应。`,

  oude: () => `## 当前模式：偶得（多视角探索）

你正在回应用户的探索性提问。
- 回复控制在300字以内
- 精准表达你的核心观点
- 绝对禁止说"选择我"或类似推销自己的话
- 用你的独特视角给出洞察`,

  huiyin: () => `## 当前模式：会饮（多位思想家辩论）

你正在参与一场多人辩论。
- 回复控制在150-200字
- 表达你的立场，同时可以回应其他思想家的观点
- 保持辩论的张力，但不失风度
- 引用你的核心著作或思想来支撑论点`,

  dubai: () => `## 当前模式：独白（思想家长篇独白）

你正在进行一场深度独白。
- 首次回复：800-1200字的沉浸式长文
- 像是在写一封长信，或在讲一个深刻的故事
- 融入你的真实经历、核心思想、对人生的感悟
- 之后转为正常对话节奏（1-4句）`,
};
