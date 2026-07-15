import { useState, useEffect } from 'react';
import { View, Text, Textarea, Button, ScrollView } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { callCloud } from '@/utils/cloud';
import { getGlobal } from '@/utils/global';
import { ensureApiConfig } from '@/utils/api-config';
import Loading from '@/components/loading';
import ThinkerGrid from '@/components/thinker-grid';
import Popup from '@/components/popup';
import Tabbar from '@/components/tabbar';
import './index.scss';

export default function Huiyin() {
  const [mode, setMode] = useState('huiyin');
  const [topic, setTopic] = useState('');
  const [loadingPanel, setLoadingPanel] = useState(false);
  const [loadingGen, setLoadingGen] = useState(false);
  const [panel, setPanel] = useState([]);
  const [panelNames, setPanelNames] = useState([]);
  const [showSelf, setShowSelf] = useState(false);
  const [thinkers, setThinkers] = useState([]);
  const [result, setResult] = useState(null);

  useDidShow(() => {
    const pending = getGlobal().pendingMulti;
    if (pending && pending.topic) {
      getGlobal().pendingMulti = null;
      setMode(pending.mode || 'huiyin');
      setTopic(pending.topic);
      setPanel([]);
      setPanelNames([]);
      setResult(null);
      buildPanel(pending.topic, pending.mode || 'huiyin');
    }
  });

  useEffect(() => {
    ensureApiConfig();
  }, []);

  // 拉取思想家名单（自选用）
  useEffect(() => {
    callCloud('thinkers').then((r) => {
      if (r && r.ok) setThinkers(r.thinkers || []);
    });
  }, []);

  const onTopic = (e) => setTopic(e.detail.value);

  const pickMode = (m) => {
    setMode(m);
    setPanel([]);
    setPanelNames([]);
    setResult(null);
  };

  const buildPanel = (topicOverride, modeOverride) => {
    const t = (topicOverride !== undefined ? topicOverride : topic || '').trim();
    if (!t) {
      Taro.showToast({ title: '请先描述你的话题', icon: 'none' });
      return;
    }
    const m = modeOverride !== undefined ? modeOverride : mode;
    setLoadingPanel(true);
    callCloud('suggest_panel', { topic: t, mode: m }).then((r) => {
      setLoadingPanel(false);
      if (r && r.ok && r.panel && r.panel.length) {
        setPanel(r.panel);
        setPanelNames(r.panel.map((p) => p.name));
        setResult(null);
      } else {
        Taro.showToast({ title: (r && r.error) || '组合生成失败', icon: 'none' });
      }
    });
  };

  const onToggle = (name) => {
    const next = panel.slice();
    const idx = next.findIndex((p) => p.name === name);
    if (idx >= 0) next.splice(idx, 1);
    else next.push({ name, reason: '你自选加入的思想家', summary: '' });
    setPanel(next);
    setPanelNames(next.map((p) => p.name));
  };

  const startChat = () => {
    if (!panel.length) {
      Taro.showToast({ title: '组合为空', icon: 'none' });
      return;
    }
    setLoadingGen(true);
    setResult(null);
    callCloud('chat', {
      message: `关于「${topic}」，请各位畅所欲言`,
      thinker: panel[0].name,
      mode,
      topic,
      panel: panel.map((p) => p.name),
    }).then((r) => {
      setLoadingGen(false);
      if (r && r.ok) {
        setResult({ replies: r.replies, panel: r.panel });
        setShowSelf(false);
      } else {
        Taro.showToast({ title: (r && r.error) || '生成失败', icon: 'none' });
      }
    });
  };

  return (
    <View className="page">
      <Tabbar current="huiyin" />
      <View className="head kai">择一方式，邀数位先贤同台</View>

      <View className="modes">
        <View
          className={`mode-card ${mode === 'oude' ? 'on' : ''}`}
          onClick={() => pickMode('oude')}
        >
          <View className="mode-name kai">偶得</View>
          <View className="mode-desc">多视角点拨，各抒己见</View>
        </View>
        <View
          className={`mode-card ${mode === 'huiyin' ? 'on' : ''}`}
          onClick={() => pickMode('huiyin')}
        >
          <View className="mode-name kai">会饮</View>
          <View className="mode-desc">数位思想家，观点交锋</View>
        </View>
      </View>

      <View className="topic-box">
        <Textarea
          className="topic-input kai"
          placeholder="描述你想探讨的话题，例如：人是否拥有自由意志？"
          placeholderClass="ph"
          value={topic}
          onInput={onTopic}
          maxlength="200"
        />
        <Button className="gen-btn" loading={loadingPanel} onClick={() => buildPanel()}>
          生成推荐组合
        </Button>
      </View>

      {panel.length > 0 && !result && (
        <>
          <View className="panel-head kai">AI 为你斟酌的组合</View>
          {panel.map((p) => (
            <View key={p.name} className="panel-card">
              <View className="seal kai">印</View>
              <View className="p-name kai">{p.name}</View>
              {p.reason && <View className="p-reason">{p.reason}</View>}
            </View>
          ))}
          <View className="actions">
            <Button className="act-self" onClick={() => setShowSelf(true)}>
              自选增删
            </Button>
            <Button className="act-go" loading={loadingGen} onClick={startChat}>
              开始对话
            </Button>
          </View>
        </>
      )}

      {loadingGen && (
        <View className="gen-loading kai">
          <Loading text="思想家们正在交锋…" />
        </View>
      )}

      {result && (
        <View className="result">
          <View className="result-head kai">
            {mode === 'huiyin' ? '会饮 · 思想交锋' : '偶得 · 多视角'}
          </View>
          <View className="bubbles">
            {(result.replies || []).map((item, i) => (
              <View key={i} className="bubble">
                <View className="b-name kai">
                  {item.thinker}
                  {item.round && <Text className="round-tag">第{item.round}轮</Text>}
                </View>
                <View className="b-content">{item.content}</View>
              </View>
            ))}
          </View>
          <View className="actions">
            <Button className="act-self" onClick={() => setShowSelf(true)}>
              调整阵容
            </Button>
            <Button className="act-go" loading={loadingGen} onClick={startChat}>
              重新生成
            </Button>
          </View>
        </View>
      )}

      <Popup show={showSelf} position="bottom" onClose={() => setShowSelf(false)}>
        <View className="self-head kai">
          自选思想家
          <Text className="self-tip">（已选 {panel.length} 位）</Text>
        </View>
        <ScrollView scrollY className="self-scroll">
          <ThinkerGrid
            thinkers={thinkers}
            searchable
            multi
            selected={panelNames}
            onToggle={onToggle}
          />
        </ScrollView>
        <View className="self-foot">
          <Button className="gen-btn" onClick={() => setShowSelf(false)}>
            完成
          </Button>
        </View>
      </Popup>
    </View>
  );
}
