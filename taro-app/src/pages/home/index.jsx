import { useState, useEffect } from 'react';
import { View, Text, Textarea, Button } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { callCloud } from '@/utils/cloud';
import { getGlobal } from '@/utils/global';
import { ensureApiConfig } from '@/utils/api-config';
import thinkersData from '@/data/thinkers.json';
import Loading from '@/components/loading';
import Tabbar from '@/components/tabbar';
import './index.scss';

const MODES = [
  { key: 'duixi', name: '对席', desc: '与一位思想家深度长谈' },
  { key: 'dubai', name: '独白', desc: '听思想家沉浸式长文' },
  { key: 'oude', name: '偶得', desc: '数位先贤多视角点拨' },
  { key: 'huiyin', name: '会饮', desc: '群贤观点交锋辩论' },
];

// 名言锦句（与思想家数据对应，点击即与这位思想家开聊）
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

// 推荐问题（点击填入输入框）
const QUESTIONS = [
  '如何面对人生的低谷与挫折？',
  '怎样在喧嚣中找回内心的平静？',
  '人生的意义到底是什么？',
  '如何在逆境中保持从容与希望？',
  '怎样与自己和解，接纳不完美的自己？',
  '面对选择时，如何听从内心的声音？',
];

// 推荐思想家（取自数据，点击直接开聊）
const FEATURED_NAMES = ['尼采', '庄子', '王阳明', '苏轼', '史铁生', '加缪'];
const ALL_THINKERS = thinkersData.thinkers || [];
const FEATURED = FEATURED_NAMES
  .map((n) => ALL_THINKERS.find((t) => t.name === n))
  .filter(Boolean)
  .map((t) => ({ name: t.name, tag: t.tagline || t.summary || '', field: t.field || '' }));

export default function Home() {
  const [topic, setTopic] = useState('');
  const [mode, setMode] = useState('duixi');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('input');
  const [recommends, setRecommends] = useState([]);
  const [continueSession, setContinueSession] = useState('');
  const [quoteIdx, setQuoteIdx] = useState(0);

  useDidShow(() => {
    const id = getGlobal().lastSessionId;
    setContinueSession(id || '');
  });

  useEffect(() => {
    ensureApiConfig();
    setQuoteIdx(Math.floor(Math.random() * QUOTES.length));
  }, []);

  const isMulti = mode === 'oude' || mode === 'huiyin';

  const onTopic = (e) => setTopic(e.detail.value);

  const pickMode = (key) => {
    setMode(key);
    setStep('input');
    setRecommends([]);
  };

  const onSubmit = async () => {
    const t = (topic || '').trim();
    if (!t || loading) {
      Taro.showToast({ title: '请先描述你的话题', icon: 'none' });
      return;
    }
    if (isMulti) {
      getGlobal().pendingMulti = { mode, topic: t };
      Taro.redirectTo({ url: '/pages/huiyin/index' });
      return;
    }
    setLoading(true);
    setStep('input');
    const r = await callCloud('recommend', { topic: t });
    setLoading(false);
    if (r && r.ok && r.thinkers && r.thinkers.length) {
      setRecommends(r.thinkers.slice(0, 3));
      setStep('result');
    } else if (r && r.error) {
      Taro.showToast({ title: r.error, icon: 'none' });
    } else if (r) {
      Taro.showToast({ title: '未寻得合适之人', icon: 'none' });
    }
  };

  const onPick = (item) => {
    if (!item || !item.name) return;
    const t = encodeURIComponent((topic || '').trim());
    Taro.navigateTo({
      url: `/pages/chat/index?thinker=${encodeURIComponent(item.name)}&mode=${mode}&topic=${t}`,
    });
  };

  const continueLast = () => {
    const id = continueSession;
    if (!id) return;
    Taro.navigateTo({ url: `/pages/chat/index?sessionId=${encodeURIComponent(id)}` });
  };

  const fillTopic = (q) => setTopic(q);

  const startQuote = (q) => {
    const t = encodeURIComponent(q.text);
    Taro.navigateTo({
      url: `/pages/chat/index?thinker=${encodeURIComponent(q.name)}&mode=duixi&topic=${t}`,
    });
  };

  const startThinker = (t) => {
    Taro.navigateTo({
      url: `/pages/chat/index?thinker=${encodeURIComponent(t.name)}&mode=duixi&topic=${encodeURIComponent('')}`,
    });
  };

  const nextQuote = () => setQuoteIdx((i) => (i + 1) % QUOTES.length);

  const q = QUOTES[quoteIdx];

  return (
    <View className="page">
      <Tabbar current="home" />

      <View className="brand">
        <View className="brand-title kai">思想家 · AI</View>
        <View className="brand-sub kai">道出你的困惑，与百位先贤对谈</View>
      </View>

      <View className="ask-box">
        <Textarea
          className="ask-input kai"
          placeholder="例如：如何面对人生的挫折与低谷？"
          placeholderClass="ph"
          value={topic}
          onInput={onTopic}
          autoFocus
          maxlength="200"
        />
      </View>

      {continueSession && (
        <View className="continue kai" onClick={continueLast}>
          ↺ 继续上次对话
        </View>
      )}

      <View className="mode-label kai">选择对话方式</View>
      <View className="modes">
        {MODES.map((m) => (
          <View
            key={m.key}
            className={`mode-chip ${mode === m.key ? 'on' : ''}`}
            onClick={() => pickMode(m.key)}
          >
            <View className="mc-name kai">{m.name}</View>
            <View className="mc-desc">{m.desc}</View>
          </View>
        ))}
      </View>

      <Button
        className="ask-btn"
        loading={loading}
        onClick={onSubmit}
        hoverClass="ask-btn-hover"
      >
        {isMulti ? '邀贤同台' : '为我引荐'}
      </Button>

      {loading && (
        <View className="loading kai">
          <Loading text="引荐中…" />
        </View>
      )}

      {step === 'result' && recommends.length > 0 && (
        <View className="rec-head kai">为你寻得三位知己</View>
      )}
      <View className="rec-list">
        {recommends.map((item, idx) => (
          <View
            key={item.name}
            className="rec-card"
            onClick={() => onPick(item)}
            hoverClass="rec-hover"
          >
            <View className="rec-no kai">{idx + 1}</View>
            <View className="rec-body">
              <View className="rec-name kai">{item.name}</View>
              <View className="rec-reason">{item.reason}</View>
            </View>
            <View className="rec-go kai">谈 ›</View>
          </View>
        ))}
      </View>

      {step === 'result' && recommends.length === 0 && !loading && (
        <View className="empty kai">此问深矣，容我再思。不妨换种说法试试？</View>
      )}

      {/* ===== 填充区：名言 / 推荐问题 / 推荐思想家 ===== */}
      <View className="inspire">
        <View className="inspire-head kai">
          <Text>每日一句</Text>
          <Text className="inspire-more" onClick={nextQuote}>换一句 ›</Text>
        </View>
        <View className="quote-card" onClick={() => startQuote(q)} hoverClass="quote-hover">
          <View className="quote-mark kai">“</View>
          <View className="quote-text kai">{q.text}</View>
          <View className="quote-src">— {q.name} · {q.src}</View>
        </View>

        <View className="inspire-head kai">想和思想家聊聊</View>
        <View className="q-chips">
          {QUESTIONS.map((qq) => (
            <View key={qq} className="q-chip" onClick={() => fillTopic(qq)}>
              {qq}
            </View>
          ))}
        </View>

        <View className="inspire-head kai">推荐思想家</View>
        <View className="feat-list">
          {FEATURED.map((t) => (
            <View key={t.name} className="feat-card" onClick={() => startThinker(t)} hoverClass="feat-hover">
              <View className="feat-name kai">{t.name}</View>
              <View className="feat-tag">{t.tag}</View>
              {t.field && <View className="feat-field">{t.field}</View>}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
