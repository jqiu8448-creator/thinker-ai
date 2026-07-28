import { useState, useEffect, useRef } from 'react';
import { View, Text, Input } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { ensureApiConfig, hasApiConfig } from '@/utils/api-config';
import { callCloud } from '@/utils/cloud';
import { getGlobal } from '@/utils/global';
import Tabbar from '@/components/tabbar';
import thinkersData from '@/data/thinkers.json';
import './index.scss';

const MODES = [
  { key: 'duixi', name: '对席', desc: '一对一深度对谈，深入阐发' },
  { key: 'dubai', name: '独白', desc: '思想家长篇独白，沉浸式长文' },
  { key: 'oude', name: '偶得', desc: '多视角并行，各抒己见' },
  { key: 'huiyin', name: '会饮', desc: '多位思想家聚谈，观点交锋' },
];

const QUOTES = [
  { name: '尼采', text: '那些杀不死我的，终将使我更强大。', src: '《偶像的黄昏》' },
  { name: '庄子', text: '吾生也有涯，而知也无涯。', src: '《庄子·养生主》' },
  { name: '苏轼', text: '回首向来萧瑟处，归去，也无风雨也无晴。', src: '《定风波》' },
  { name: '加缪', text: '在隆冬，我终于知道，我身上有一个不可战胜的夏天。', src: '《夏天集》' },
  { name: '史铁生', text: '命定的局限尽可永在，不屈的挑战却不可须臾或缺。', src: '《我与地坛》' },
  { name: '苏格拉底', text: '未经省察的人生，是不值得过的。', src: '《申辩篇》' },
  { name: '贝多芬', text: '我要扼住命运的咽喉，它绝不能使我完全屈服。', src: '书信集' },
  { name: '王阳明', text: '知是行之始，行是知之成。', src: '《传习录》' },
];

const QUESTIONS_POOL = [
  '如何面对人生的低谷与挫折？',
  '怎样在喧嚣中找回内心的平静？',
  '人生的意义到底是什么？',
  '如何在逆境中保持从容与希望？',
  '为什么我总觉得自己不够好？',
  '如何与孤独相处？',
  '怎样才能放下过去的遗憾？',
  '为什么越努力越焦虑？',
  '如何找到真正热爱的事？',
  '人为什么要活着？',
  '如何面对亲人的离去？',
  '怎样才能不被情绪控制？',
  '为什么懂了很多道理却过不好这一生？',
  '如何在不完美的关系中自处？',
  '怎样才能停止内耗？',
  '人生有没有标准答案？',
  '如何面对别人的不理解？',
  '怎样才能真正接纳自己？',
  '为什么总是感到迷茫？',
  '如何在竞争激烈的职场中保持自我？',
  '怎样才算活出了自己？',
  '为什么我总是讨好别人？',
  '如何面对人到中年的危机感？',
  '怎样才能让心不再漂泊？',
  '为什么越是拥有越是不安？',
  '如何与自己不喜欢的人共处？',
  '怎样才能走出舒适区？',
  '为什么我害怕做出选择？',
  '如何面对不完美的自己？',
  '怎样才能活得不那么累？',
];

const NUMS = ['其一', '其二', '其三', '其四'];

const CATEGORY_KEYWORDS = [
  { cat: '挫折·逆境', keywords: ['挫折', '低谷', '逆境', '失败', '困难', '打击', '绝望', '熬', '挺', '扛'] },
  { cat: '成长·心态', keywords: ['成长', '心态', '努力', '坚持', '自律', '改变', '提升', '进步', '变强'] },
  { cat: '人生哲学·存在意义', keywords: ['人生', '意义', '存在', '价值', '活着', '为什么', '目的', '方向'] },
  { cat: '心理·情绪', keywords: ['焦虑', '抑郁', '情绪', '压力', '心理', '痛苦', '迷茫', '孤独', '害怕', '恐惧'] },
  { cat: '爱情·感情', keywords: ['爱情', '爱', '感情', '恋爱', '分手', '失恋', '婚姻', '伴侣', '喜欢'] },
  { cat: '人际关系·为人处世', keywords: ['人际', '关系', '朋友', '相处', '沟通', '社交', '为人', '处世', '人情'] },
  { cat: '职场·升职·创业', keywords: ['工作', '职场', '创业', '升职', '事业', '职业', '老板', '同事', '赚钱'] },
  { cat: '生死·信仰', keywords: ['死亡', '生死', '信仰', '灵魂', '来世', '宗教', '佛', '道', '神'] },
  { cat: '社会·时代', keywords: ['社会', '时代', '世界', '国家', '制度', '资本', '人性', '公平'] },
  { cat: '家庭·教育', keywords: ['家庭', '教育', '孩子', '父母', '亲子', '原生', '家人'] },
  { cat: '创意·灵感', keywords: ['创意', '灵感', '创作', '艺术', '设计', '写作', '创新', '想象力'] },
  { cat: '学业·教育', keywords: ['学习', '读书', '考试', '学业', '学生', '考研', '知识'] },
  { cat: '友情', keywords: ['友情', '朋友', '知己', '友谊', '兄弟', '闺蜜'] },
];

const LEADER_INTROS = [
  '沉吟片刻，缓缓开口……',
  '闭目凝神，似在翻阅千年典籍……',
  '抚须而笑，目光穿越时空……',
  '衣袖轻拂，茶香氤氲中若有所思……',
];

function matchCategories(topic) {
  const t = topic || '';
  const matched = [];
  for (const { cat, keywords } of CATEGORY_KEYWORDS) {
    if (keywords.some((k) => t.includes(k))) {
      matched.push(cat);
    }
  }
  return matched;
}

export default function Home() {
  const [topic, setTopic] = useState('');
  const [continueSession, setContinueSession] = useState('');
  const [quoteIdx, setQuoteIdx] = useState(0);
  const [step, setStep] = useState('idle');
  const [selectedMode, setSelectedMode] = useState(null);
  const [recommended, setRecommended] = useState([]);
  const [leaderText, setLeaderText] = useState('');
  const [showRecommend, setShowRecommend] = useState(false);
  const [manualSelect, setManualSelect] = useState(false);
  const [selectedThinkers, setSelectedThinkers] = useState([]);
  const [questionIdx, setQuestionIdx] = useState(0);
  const [questions, setQuestions] = useState(() => {
    const shuffled = [...QUESTIONS_POOL].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 4);
  });

  const timersRef = useRef([]);
  const reshufflingRef = useRef(false);

  // 随机抽4个问题
  const pickQuestions = (pool) => {
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 4);
  };

  // 换一批问题（防抖）
  const refreshQuestions = () => {
    if (reshufflingRef.current) return;
    reshufflingRef.current = true;
    setQuestions(pickQuestions(QUESTIONS_POOL));
    setTimeout(() => {
      reshufflingRef.current = false;
    }, 500);
  };

  useDidShow(() => {
    const id = getGlobal().lastSessionId;
    setContinueSession(id || '');
  });

  useEffect(() => {
    ensureApiConfig();
    setQuoteIdx(Math.floor(Math.random() * QUOTES.length));
    return () => {
      timersRef.current.forEach(clearTimeout);
    };
  }, []);

  const onTopic = (e) => setTopic(e.detail.value);

  const onSubmit = () => {
    const t = (topic || '').trim();
    if (!t) {
      Taro.showToast({ title: '请先描述你的话题', icon: 'none' });
      return;
    }
    setStep('select-mode');
  };

  const continueLast = () => {
    const id = continueSession;
    if (!id) return;
    Taro.navigateTo({ url: `/pages/huiyin/index?sessionId=${encodeURIComponent(id)}` });
  };

  const fillTopic = (q) => setTopic(q);

  const startQuote = (q) => {
    const t = encodeURIComponent(q.text);
    Taro.navigateTo({
      url: `/pages/huiyin/index?thinker=${encodeURIComponent(q.name)}&mode=duixi&topic=${t}`,
    });
  };

  const nextQuote = () => setQuoteIdx((i) => (i + 1) % QUOTES.length);

  const goBack = () => {
    if (step === 'recommending') return;
    // 清理所有定时器
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    if (step === 'select-thinkers' || step === 'recommended') {
      setStep('select-mode');
      setShowRecommend(false);
      setRecommended([]);
      setManualSelect(false);
      setSelectedThinkers([]);
      return;
    }
    if (step === 'select-mode') {
      setStep('idle');
      setSelectedMode(null);
      return;
    }
  };

  const selectMode = (modeKey) => {
    setSelectedMode(modeKey);
    setStep('recommending');
    setShowRecommend(false);
    setRecommended([]);
    setManualSelect(false);
    setSelectedThinkers([]);

    const isMultiMode = modeKey === 'oude' || modeKey === 'huiyin';
    const intro = LEADER_INTROS[Math.floor(Math.random() * LEADER_INTROS.length)];
    setLeaderText(intro);

    console.log('[selectMode] 开始推荐，topic:', topic, 'hasApi:', hasApiConfig());

    // 调用大模型（组长）理解问题并推荐思想家
    callCloud('recommend', { topic })
      .then((r) => {
        console.log('[selectMode] recommend 返回:', r);

        let thinkerList = [];
        let reason = '';

        if (r && r.ok && r.thinkers && r.thinkers.length) {
          thinkerList = r.thinkers.slice(0, 4).map((t) => ({
            name: t.name,
            reason: t.reason || '适合与你探讨这个问题',
            summary: t.summary || '',
          }));
          console.log('[selectMode] 推荐结果:', thinkerList);
          reason = '细读你的困惑，为你引荐以下几位：';
        } else {
          console.log('[selectMode] 推荐失败，降级到本地兜底');
          // 降级：本地兜底，根据话题关键词生成更贴切的理由
          const categories = thinkersData.categories || [];
          const allThinkers = thinkersData.thinkers || [];
          const fallbackCat = categories.find((c) => c.name === '万能兜底（话题完全模糊时）');
          const pool = (fallbackCat && fallbackCat.thinkers) || allThinkers.slice(0, 8);
          const shuffled = [...pool].sort(() => Math.random() - 0.5);
          thinkerList = shuffled.slice(0, 4).map((t) => ({
            name: t.name,
            reason: `${t.name}擅长${t.summary}，适合回应你此刻的困惑`,
            summary: t.summary || '',
          }));
          reason = '细细思量你的问题，以下几位或可与你深谈：';
        }

        setLeaderText(reason);
        setRecommended(thinkerList);
        // 对席/独白：展示推荐列表；偶得/会饮：直接进入自动/手动选择面板
        const isMultiMode = modeKey === 'oude' || modeKey === 'huiyin';
        setStep(isMultiMode ? 'select-thinkers' : 'recommended');
        const showTimer = setTimeout(() => setShowRecommend(true), 100);
        timersRef.current.push(showTimer);
      })
      .catch((err) => {
        console.error('[selectMode] recommend 异常:', err);
        // 异常兜底
        setLeaderText('细细思量你的问题，以下几位或可与你深谈：');
        setRecommended([
          { name: '王阳明', reason: '心学知行合一，会从内心的力量帮你找到方向' },
          { name: '苏轼', reason: '一生豁达，会以诗意的旷达帮你化解心中郁结' },
          { name: '庄子', reason: '逍遥齐物，会从超越世俗的角度让你重新看待困境' },
          { name: '尼采', reason: '超人哲学，会以不屈的意志激发你内在的力量' },
        ]);
        setStep(isMultiMode ? 'select-thinkers' : 'recommended');
        const showTimer = setTimeout(() => setShowRecommend(true), 100);
        timersRef.current.push(showTimer);
      });
  };

  const startChat = (thinkerName) => {
    const t = encodeURIComponent(topic);
    const mode = selectedMode || 'duixi';
    if (mode === 'oude' || mode === 'huiyin') {
      const names = recommended.slice(0, 3).map((r) => r.name);
      if (thinkerName && !names.includes(thinkerName)) {
        names.unshift(thinkerName);
      }
      const thinkersParam = encodeURIComponent(names.join(','));
      Taro.navigateTo({
        url: `/pages/huiyin/index?thinkers=${thinkersParam}&mode=${mode}&topic=${t}`,
      });
    } else {
      const th = encodeURIComponent(thinkerName || (recommended[0]?.name || ''));
      Taro.navigateTo({
        url: `/pages/huiyin/index?thinker=${th}&mode=${mode}&topic=${t}`,
      });
    }
  };

  // 自动选择（取推荐前3位）
  const autoSelectThinkers = () => {
    let names = recommended.slice(0, 3).map((r) => r.name);
    if (names.length === 0) {
      // 无推荐时兜底
      const all = thinkersData.thinkers || [];
      names = all.slice(0, 3).map((t) => t.name);
    }
    const t = encodeURIComponent(topic);
    const mode = selectedMode || 'oude';
    const thinkersParam = encodeURIComponent(names.join(','));
    Taro.navigateTo({
      url: `/pages/huiyin/index?thinkers=${thinkersParam}&mode=${mode}&topic=${t}`,
    });
  };

  // 手动选择：切换到网格选择
  const toggleManualSelect = () => {
    setManualSelect(true);
    setSelectedThinkers([]);
  };

  // 手动选择：点击思想家
  const toggleThinker = (name) => {
    setSelectedThinkers((prev) => {
      if (prev.includes(name)) return prev.filter((n) => n !== name);
      if (prev.length >= 3) {
        Taro.showToast({ title: '最多选择3位', icon: 'none', duration: 1500 });
        return prev;
      }
      return [...prev, name];
    });
  };

  // 手动选择：确认开始对话
  const startManualChat = () => {
    if (selectedThinkers.length !== 3) {
      Taro.showToast({ title: '请选择3位思想家', icon: 'none' });
      return;
    }
    const t = encodeURIComponent(topic);
    const mode = selectedMode || 'oude';
    const thinkersParam = encodeURIComponent(selectedThinkers.join(','));
    Taro.navigateTo({
      url: `/pages/huiyin/index?thinkers=${thinkersParam}&mode=${mode}&topic=${t}`,
    });
  };

  const reshuffle = () => {
    // 防抖：正在推荐中则跳过
    if (reshufflingRef.current || step === 'recommending') return;
    reshufflingRef.current = true;

    // 清理之前的定时器
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    setShowRecommend(false);
    const t1 = setTimeout(() => {
      setStep('recommending');
      setLeaderText('再为你寻觅几位……');
      const t2 = setTimeout(() => {
        selectMode(selectedMode);
        reshufflingRef.current = false;
      }, 1200);
      timersRef.current.push(t2);
    }, 300);
    timersRef.current.push(t1);
  };

  const q = QUOTES[quoteIdx];

  return (
    <View className="page">
      <Tabbar current="home" />

      {/* 标题 */}
      <View className={`hero step-${step}`}>
        <View className="hero-title">问 道</View>
        <View className="hero-sub">千年智慧，一问即至</View>
      </View>

      {/* 输入框 + 竖排按钮 */}
      <View className={`input-box step-${step}`}>
        <Input
          className="input-field"
          placeholder="例如：如何面对人生的挫折与低谷？"
          placeholderClass="ph"
          value={topic}
          onInput={onTopic}
          onConfirm={onSubmit}
          maxlength="200"
          confirmType="send"
          disabled={step !== 'idle'}
        />
        <View className={`send-btn ${step === 'recommending' ? 'disabled' : ''}`} onClick={step === 'idle' ? onSubmit : (step === 'recommending' ? undefined : goBack)}>
          {step === 'idle' ? (
            <>
              <Text>为我</Text>
              <Text>引荐</Text>
            </>
          ) : (
            <Text className="back-icon">‹</Text>
          )}
        </View>
      </View>

      {/* 步骤 0：idle 状态 — 每日一句 + 推荐问题 + 模式小字 */}
      {step === 'idle' && (
        <View className="idle-content fade-in">
          {continueSession && (
            <View className="continue" onClick={continueLast}>
              ↺ 继续上次对话
            </View>
          )}

          <View className="ink-divider">
            <Text className="divider-mark">每日一句</Text>
          </View>

          <View className="quote-block" onClick={() => startQuote(q)}>
            <View className="quote-text">{q.text}</View>
            <View className="quote-src">— {q.name} · {q.src}</View>
          </View>
          <View className="quote-more" onClick={nextQuote}>换一句 ›</View>

          <View className="rec-section">
            <View className="rec-label-row">
              <Text className="rec-label">想和思想家聊聊</Text>
              <Text className="rec-more" onClick={refreshQuestions}>换一批 ›</Text>
            </View>
            <View className="rec-grid">
              {questions.map((qq, i) => (
                <View key={qq + i} className="rec-card" onClick={() => fillTopic(qq)}>
                  <Text className="rec-num">{NUMS[i]}</Text>
                  <Text className="rec-text">{qq}</Text>
                </View>
              ))}
            </View>
          </View>

          <View className="guide-strip">
            {MODES.map((m) => (
              <Text key={m.key} className="guide-link" onClick={() => {
                if (!topic.trim()) {
                  Taro.showToast({ title: '请先描述你的话题', icon: 'none' });
                  return;
                }
                setStep('select-mode');
              }}>{m.name}</Text>
            ))}
          </View>
        </View>
      )}

      {/* 步骤 1：选择对话模式 */}
      {step === 'select-mode' && (
        <View className="mode-panel fade-in">
          <View className="mode-label">请选择对话方式</View>
          <View className="mode-grid">
            {MODES.map((m, i) => (
              <View
                key={m.key}
                className="mode-card"
                onClick={() => selectMode(m.key)}
              >
                <View className="mode-num">{NUMS[i]}</View>
                <View className="mode-name">{m.name}</View>
                <View className="mode-desc">{m.desc}</View>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* 步骤 2-3：智能体组长推荐 */}
      {(step === 'recommending' || step === 'recommended') && (
        <View className="recommend-panel fade-in">
          <View className="leader-card">
            <View className="leader-avatar">
              <Text className="leader-char">荐</Text>
            </View>
            <View className="leader-bubble">
              <Text className="leader-text">{leaderText}</Text>
              {step === 'recommending' && (
                <View className="thinking-dots">
                  <Text className="dot">·</Text>
                  <Text className="dot">·</Text>
                  <Text className="dot">·</Text>
                </View>
              )}
            </View>
          </View>

          {step === 'recommended' && (
            <View className={`thinker-list ${showRecommend ? 'show' : ''}`}>
              {recommended.map((r, i) => (
                <View
                  key={r.name}
                  className="thinker-item"
                  style={{ animationDelay: `${i * 120}ms` }}
                  onClick={() => startChat(r.name)}
                >
                  <View className="thinker-avatar-sm">
                    <Text className="thinker-avatar-text">{r.name.charAt(0)}</Text>
                  </View>
                  <View className="thinker-info">
                    <View className="thinker-name">{r.name}</View>
                    <View className="thinker-angle">{r.reason}</View>
                  </View>
                  <View className="thinker-arrow">›</View>
                </View>
              ))}

              <View className="recommend-actions">
                <View className="reshuffle-btn" onClick={reshuffle}>换一批</View>
                <View
                  className="start-btn"
                  onClick={() => startChat(recommended[0]?.name)}
                >
                  开始对话
                </View>
              </View>
            </View>
          )}
        </View>
      )}

      {/* 步骤 2b：偶得/会饮 — 自动/手动选择面板 */}
      {step === 'select-thinkers' && (
        <View className="recommend-panel fade-in">
          <View className="leader-card">
            <View className="leader-avatar">
              <Text className="leader-char">荐</Text>
            </View>
            <View className="leader-bubble">
              <Text className="leader-text">{leaderText}</Text>
            </View>
          </View>

          <View className={`thinker-list ${showRecommend ? 'show' : ''}`}>
            {/* 选择方式 */}
            {!manualSelect ? (
              <View className="select-thinker-actions">
                <View className="select-label">选择方式</View>
                <View className="select-btn-row">
                  <View className="select-auto-btn" onClick={autoSelectThinkers}>
                    <Text className="select-btn-title">自动选择</Text>
                    <Text className="select-btn-desc">使用推荐的前3位</Text>
                  </View>
                  <View className="select-manual-btn" onClick={toggleManualSelect}>
                    <Text className="select-btn-title">手动选择</Text>
                    <Text className="select-btn-desc">自行挑选3位思想家</Text>
                  </View>
                </View>
                <View className="reshuffle-btn" onClick={reshuffle}>换一批推荐</View>
              </View>
            ) : (
              <View className="manual-select-panel">
                <View className="manual-select-header">
                  <Text className="manual-select-title">选择3位思想家</Text>
                  <Text className="manual-select-count">{selectedThinkers.length} / 3</Text>
                </View>
                <View className="thinker-grid">
                  {(thinkersData.thinkers || []).map((t) => {
                    const selected = selectedThinkers.includes(t.name);
                    return (
                      <View
                        key={t.name}
                        className={`thinker-grid-item ${selected ? 'selected' : ''}`}
                        onClick={() => toggleThinker(t.name)}
                      >
                        <Text className="grid-item-name">{t.name}</Text>
                      </View>
                    );
                  })}
                </View>
                <View
                  className={`manual-confirm-btn ${selectedThinkers.length === 3 ? 'active' : ''}`}
                  onClick={startManualChat}
                >
                  {selectedThinkers.length === 3 ? '开始对话' : `还需选择 ${3 - selectedThinkers.length} 位`}
                </View>
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
}
