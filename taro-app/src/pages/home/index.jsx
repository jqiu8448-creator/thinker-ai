import { useState, useEffect } from 'react';
import { View, Text, Textarea, Button } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { callCloud } from '@/utils/cloud';
import { getGlobal } from '@/utils/global';
import { ensureApiConfig } from '@/utils/api-config';
import Loading from '@/components/loading';
import Tabbar from '@/components/tabbar';
import './index.scss';

const MODES = [
  { key: 'duixi', name: '对席', desc: '与一位思想家深度长谈' },
  { key: 'dubai', name: '独白', desc: '听思想家沉浸式长文' },
  { key: 'oude', name: '偶得', desc: '数位先贤多视角点拨' },
  { key: 'huiyin', name: '会饮', desc: '群贤观点交锋辩论' },
];

export default function Home() {
  const [topic, setTopic] = useState('');
  const [mode, setMode] = useState('duixi');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('input');
  const [recommends, setRecommends] = useState([]);
  const [continueSession, setContinueSession] = useState('');

  useDidShow(() => {
    const id = getGlobal().lastSessionId;
    setContinueSession(id || '');
  });

  useEffect(() => {
    ensureApiConfig();
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
        <View className="empty kai">暂未寻得合适之人，换种说法再试。</View>
      )}
    </View>
  );
}
