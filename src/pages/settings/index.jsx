import { useState, useEffect, useRef } from 'react';
import { View, Text, Input, Button, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { callCloud } from '@/utils/cloud';
import { getGlobal, ensureWatermark, FONT_SCALES, getFontScale, setFontScale, applyFontScaleToDom } from '@/utils/global';
import { ensureApiConfig } from '@/utils/api-config';
import { stressTest } from '@/utils/llm';
import { modeName } from '@/utils/modes';
import { isHosted, getHostedConfig, hostedHeaders } from '@/utils/hosted';
import Popup from '@/components/popup';
import Tabbar from '@/components/tabbar';
import './index.scss';

function fmt(ts) {
  if (!ts) return '';
  const d = new Date(String(ts).replace(/-/g, '/'));
  if (isNaN(d.getTime())) return String(ts).slice(0, 10);
  const p = (n) => ('' + n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(
    d.getHours()
  )}:${p(d.getMinutes())}`;
}

export default function Settings() {
  const [sessions, setSessions] = useState([]);
  const [display, setDisplay] = useState([]);
  const [displayList, setDisplayList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [retention, setRetention] = useState(100);
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState(false);
  const [tagOptions, setTagOptions] = useState([]);
  const [watermark, setWatermark] = useState('');
  const [fontScale, setFontScaleState] = useState(getFontScale());

  // AI 接口
  const [aiProvider, setAiProvider] = useState('cloudbase');
  const [customBaseUrl, setCustomBaseUrl] = useState('');
  const [customApiKey, setCustomApiKey] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiTestResult, setAiTestResult] = useState('');
  const [stressResult, setStressResult] = useState(null);
  const [stressProgress, setStressProgress] = useState(null);
  const stressAbortRef = useRef(null);

  // 托管模式：剩余配额
  const [quotaRemaining, setQuotaRemaining] = useState(-1);
  const [quotaLimit, setQuotaLimit] = useState(3);

  // 弹层
  const [showHistory, setShowHistory] = useState(false);
  const [showWatermark, setShowWatermark] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [wmInput, setWmInput] = useState('');

  // 初次加载
  const load = () => {
    loadHistory();
    loadWatermark();
    if (isHosted()) {
      loadQuota();
    } else {
      loadAiConfig();
    }
  };

  const loadQuota = () => {
    const cfg = getHostedConfig() || {};
    setQuotaLimit(cfg.dailyLimit || 3);
    fetch('/api/quota', { headers: hostedHeaders() })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setQuotaRemaining(d.remaining);
          setQuotaLimit(d.limit);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAiConfig = () => {
    callCloud('get_setting').then((r) => {
      if (r && r.ok) {
        setAiProvider(r.aiProvider || 'cloudbase');
        setCustomBaseUrl(r.customBaseUrl || '');
        setCustomApiKey(r.customApiKey || '');
        setCustomModel(r.customModel || '');
      }
    });
  };

  const loadHistory = () => {
    setLoading(true);
    callCloud('history').then((r) => {
      if (r && r.ok) {
        const list = (r.sessions || []).map((s) =>
          Object.assign({}, s, { modeName: modeName(s.mode), time: fmt(s.updated_at) })
        );
        const retentionVal = r.retention || 100;
        const tags = collectTags(list);
        setSessions(list);
        setRetention(retentionVal);
        setLoading(false);
        setTagOptions(tags);
        applyFilter(list, filter, expanded);
      } else {
        setLoading(false);
        setSessions([]);
        setDisplay([]);
        setDisplayList([]);
      }
    });
  };

  const loadWatermark = () => {
    ensureWatermark().then((wm) => {
      if (wm) setWatermark(wm);
    });
  };

  const collectTags = (list) => Array.from(new Set(list.flatMap((s) => s.tags || [])));

  const applyFilter = (srcList, f, exp) => {
    let list = srcList;
    if (f === 'favorite') list = srcList.filter((s) => s.favorite);
    else if (f !== 'all') list = srcList.filter((s) => (s.tags || []).includes(f));
    setDisplay(list);
    setDisplayList(exp ? list : list.slice(0, 3));
  };

  const setFilterFn = (f) => {
    setFilter(f);
    setExpanded(false);
    applyFilter(sessions, f, false);
  };

  const toggleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    setDisplayList(next ? display : display.slice(0, 3));
  };

  // ===== 保留数量 =====
  const changeRetention = async (v) => {
    v = Math.max(1, Math.min(500, Math.floor(v)));
    if (v === retention) return;
    const prev = retention;
    setRetention(v);
    const r = await callCloud('set_setting', { retention: v });
    if (r && r.ok) {
      loadHistory();
    } else {
      setRetention(prev);
      Taro.showToast({ title: '保存失败，请重试', icon: 'none' });
    }
  };

  // ===== 对话字号 =====
  const changeFontScale = (key) => {
    if (key === fontScale) return;
    setFontScaleState(key);
    setFontScale(key);
    applyFontScaleToDom();
  };

  // ===== 收藏 =====
  const toggleFavorite = async (id) => {
    const s = sessions.find((x) => x.session_id === id);
    if (!s) return;
    const favorite = !s.favorite;
    const nextSessions = sessions.map((x) =>
      x.session_id === id ? Object.assign({}, x, { favorite }) : x
    );
    setSessions(nextSessions);
    applyFilter(nextSessions, filter, expanded);
    const r = await callCloud('tag_session', { session_id: id, favorite });
    if (!r) {
      const revert = nextSessions.map((x) =>
        x.session_id === id ? Object.assign({}, x, { favorite: !favorite }) : x
      );
      setSessions(revert);
      applyFilter(revert, filter, expanded);
    }
  };

  // ===== 水印 =====
  const saveWatermark = async () => {
    const wm = (wmInput || '').trim().slice(0, 20);
    const prev = watermark;
    setShowWatermark(false);
    setWatermark(wm);
    getGlobal().watermark = wm;
    const r = await callCloud('set_setting', { watermark: wm });
    if (!r || !r.ok) {
      setWatermark(prev);
      getGlobal().watermark = prev;
      Taro.showToast({ title: '保存失败，请重试', icon: 'none' });
    }
  };

  // ===== AI 接口 =====
  const saveAi = async () => {
    if (aiBusy) return;
    setAiBusy(true);
    const r = await callCloud('set_setting', {
      aiProvider,
      customBaseUrl,
      customApiKey,
      customModel,
    });
    setAiBusy(false);
    if (r && r.ok) {
      setShowAi(false);
      Taro.showToast({ title: '已保存', icon: 'success' });
    } else {
      Taro.showToast({ title: (r && r.error) || '保存失败', icon: 'none' });
    }
  };

  const testAi = async () => {
    if (aiProvider !== 'custom') {
      setAiTestResult('请先开启「使用自定义 API」再测试');
      return;
    }
    if (!customBaseUrl || !customApiKey) {
      setAiTestResult('请先填写 Base URL 与 API Key');
      return;
    }
    if (aiBusy) return;
    setAiBusy(true);
    setAiTestResult('连接中…');
    const r = await callCloud('test_ai', {
      aiProvider,
      customBaseUrl,
      customApiKey,
      customModel,
    });
    setAiBusy(false);
    if (r && r.ok && !r.error) {
      setAiTestResult('✓ ' + (r.detail || '连接成功'));
    } else {
      setAiTestResult('✗ ' + ((r && (r.error || r.detail)) || '连接失败'));
    }
  };

  const startStressTest = async () => {
    if (aiProvider !== 'custom') {
      Taro.showToast({ title: '请先开启「使用自定义 API」', icon: 'none' });
      return;
    }
    if (!customBaseUrl || !customApiKey) {
      Taro.showToast({ title: '请先填写 Base URL 与 API Key', icon: 'none' });
      return;
    }
    if (aiBusy) return;

    setAiBusy(true);
    setStressResult(null);
    setStressProgress({ tokens: 0, timeMs: 0, firstTokenMs: -1, text: '', done: false });

    const controller = new AbortController();
    stressAbortRef.current = controller;

    try {
      const result = await stressTest({
        baseUrl: customBaseUrl,
        apiKey: customApiKey,
        model: customModel || undefined,
        maxTokens: 2000,
        signal: controller.signal,
        onProgress: (p) => setStressProgress(p),
      });
      setStressResult(result);
      setStressProgress(null);
    } catch (e) {
      if (e.name === 'AbortError') {
        setAiTestResult('测试已取消');
      } else {
        setAiTestResult('✗ ' + (e.message || '测试失败'));
      }
      setStressProgress(null);
    } finally {
      setAiBusy(false);
      stressAbortRef.current = null;
    }
  };

  const cancelStressTest = () => {
    if (stressAbortRef.current) {
      stressAbortRef.current.abort();
    }
  };

  const openSession = (id) => {
    if (!id) return;
    Taro.navigateTo({ url: `/pages/huiyin/index?sessionId=${encodeURIComponent(id)}` });
  };

  return (
    <View className="page">
      <Tabbar current="settings" />
      <View className="hint kai">设置 · 对话之余</View>

      {/* 保留数量 */}
      <View className="setting-card">
        <View className="setting-row">
          <Text className="setting-label">保留会话数量</Text>
          <View className="stepper">
            <View className="step-btn" onClick={() => changeRetention(retention - 1)}>
              －
            </View>
            <Text className="step-num">{retention}</Text>
            <View className="step-btn" onClick={() => changeRetention(retention + 1)}>
              ＋
            </View>
          </View>
        </View>
        <View className="setting-tip">超出后自动删除最旧的会话（不可恢复）</View>
      </View>

      {/* 对话字号 */}
      <View className="setting-card">
        <View className="setting-row">
          <Text className="setting-label">对话字号</Text>
          <Text className="sv-text">
            {FONT_SCALES.find((s) => s.key === fontScale)?.label || '默认'}
          </Text>
        </View>
        <View className="font-scale-grid">
          {FONT_SCALES.map((s) => (
            <View
              key={s.key}
              className={`font-scale-btn ${fontScale === s.key ? 'on' : ''}`}
              onClick={() => changeFontScale(s.key)}
            >
              <Text className="fs-name">{s.label}</Text>
              <Text className={`fs-sample fs-sample-${s.key}`}>永</Text>
            </View>
          ))}
        </View>
        <View className="setting-tip">仅作用于对话气泡，自动排版不超出窗口</View>
      </View>

      {/* AI 接口 — 托管模式 / 自定义模式 */}
      {isHosted() ? (
        <View className="setting-card ai-card">
          <View className="setting-row">
            <Text className="setting-label">AI 接口</Text>
            <View className="setting-value">
              <Text className="sv-text">托管模式</Text>
            </View>
          </View>
          <View className="setting-tip">
            API 由管理员统一配置，访客无需设置。
            {(() => {
              const cfg = getHostedConfig() || {};
              return cfg.llmConfigured === false ? '（后端尚未配置 LLM，请联系管理员）' : '';
            })()}
          </View>
          <View className="setting-row" style={{ marginTop: '8rpx' }}>
            <Text className="setting-label">今日剩余</Text>
            <Text className="sv-text">
              {quotaRemaining < 0 ? '查询中…' : `${quotaRemaining} / ${quotaLimit} 题`}
            </Text>
          </View>
          <View className="setting-tip">次日 0 点重置 · 按 IP + 浏览器双绑识别</View>
        </View>
      ) : (
        <View className="setting-card ai-card">
          <View className="setting-row" onClick={() => setShowAi(!showAi)}>
            <Text className="setting-label">AI 接口</Text>
            <View className="setting-value">
              <Text className="sv-text">{aiProvider === 'custom' ? '自定义 API' : '云开发'}</Text>
              <Text className="sv-arrow">{showAi ? '⌃' : '›'}</Text>
            </View>
          </View>
          <View className="setting-tip">使用你自己的 OpenAI 兼容接口（保存在本机浏览器）</View>

          {showAi && (
            <View className="ai-inline">
              <View className="ai-tip">所有对话将走你填写的接口（保存在本机浏览器，不会上传任何服务器）。</View>
              <View className="ed-label">Base URL（含 /v1）</View>
              <Input
                className="ed-input"
                placeholder="https://api.deepseek.com/v1"
                placeholderClass="ed-ph"
                value={customBaseUrl}
                onInput={(e) => setCustomBaseUrl(e.detail.value)}
              />
              <View className="ed-label">API Key</View>
              <Input
                className="ed-input"
                placeholder="sk-..."
                placeholderClass="ed-ph"
                value={customApiKey}
                onInput={(e) => setCustomApiKey(e.detail.value)}
              />
              <View className="ed-label">模型名</View>
              <Input
                className="ed-input"
                placeholder="deepseek-chat"
                placeholderClass="ed-ph"
                value={customModel}
                onInput={(e) => setCustomModel(e.detail.value)}
              />
              <View className="ai-test">
                <Button
                  className="ai-test-btn"
                  loading={aiBusy && !stressProgress}
                  disabled={aiBusy}
                  onClick={testAi}
                >
                  测试连接
                </Button>
                {aiTestResult && <Text className="ai-test-result">{aiTestResult}</Text>}
              </View>

              {/* 压力测试 */}
              <View className="stress-test-section">
                <View className="stress-test-label">
                  <Text className="st-label-text">对席模式实测</Text>
                  <Text className="st-label-desc">
                    模拟最长模式（对席，maxTokens=6000）的完整回复，看实际消耗多少 token
                  </Text>
                </View>
                {!stressProgress && !stressResult && (
                  <Button
                    className="stress-test-btn"
                    disabled={aiBusy}
                    onClick={startStressTest}
                  >
                    开始测试
                  </Button>
                )}
                {stressProgress && (
                  <View className="stress-progress">
                    <View className="sp-stats">
                      <View className="sp-stat">
                        <Text className="sp-num">{stressProgress.tokens}</Text>
                        <Text className="sp-unit">tokens</Text>
                      </View>
                      <View className="sp-stat">
                        <Text className="sp-num">{(stressProgress.timeMs / 1000).toFixed(1)}</Text>
                        <Text className="sp-unit">秒</Text>
                      </View>
                      <View className="sp-stat">
                        <Text className="sp-num">
                          {stressProgress.firstTokenMs > 0 ? `${stressProgress.firstTokenMs}` : '—'}
                        </Text>
                        <Text className="sp-unit">首字延迟ms</Text>
                      </View>
                    </View>
                    <View className="sp-text-preview">
                      {stressProgress.text.slice(-120)}
                      <Text className="sp-cursor">▌</Text>
                    </View>
                    <Button className="stress-cancel-btn" onClick={cancelStressTest}>
                      取消测试
                    </Button>
                  </View>
                )}
                {stressResult && (
                  <View className="stress-result">
                    <View className="sr-header">
                      <Text className={`sr-status ${stressResult.complete ? 'ok' : 'warn'}`}>
                        {stressResult.complete ? '✓ 完整输出' : '⚠ 提前截断'}
                      </Text>
                      <Text className="sr-mode-tag">{stressResult.mode}</Text>
                    </View>
                    <View className="sr-stats">
                      <View className="sr-stat">
                        <Text className="sr-label">实际输出</Text>
                        <Text className="sr-value">{stressResult.tokens} tok</Text>
                      </View>
                      <View className="sr-stat">
                        <Text className="sr-label">模式上限</Text>
                        <Text className="sr-value">{stressResult.maxTokens} tok</Text>
                      </View>
                      <View className="sr-stat">
                        <Text className="sr-label">总耗时</Text>
                        <Text className="sr-value">{(stressResult.timeMs / 1000).toFixed(1)} 秒</Text>
                      </View>
                      <View className="sr-stat">
                        <Text className="sr-label">首字延迟</Text>
                        <Text className="sr-value">{stressResult.firstTokenMs} ms</Text>
                      </View>
                      <View className="sr-stat">
                        <Text className="sr-label">生成速度</Text>
                        <Text className="sr-value">
                          {Math.round(stressResult.tokens / (stressResult.timeMs / 1000))} tok/s
                        </Text>
                      </View>
                      <View className="sr-stat">
                        <Text className="sr-label">字数</Text>
                        <Text className="sr-value">{stressResult.text.length} 字</Text>
                      </View>
                    </View>
                    <View className="sr-preview">
                      <Text className="sr-preview-label">回复预览（前150字）：</Text>
                      <Text className="sr-preview-text">{stressResult.text.slice(0, 150)}…</Text>
                    </View>
                  </View>
                )}
              </View>

              <Button className="d-btn ai-save-btn" loading={aiBusy} onClick={saveAi}>
                保存
              </Button>
            </View>
          )}
        </View>
      )}

      {/* 常用功能 */}
      <View className="func-title kai">常用功能</View>
      <View className="func-grid">
        <View className="func" onClick={() => { setShowHistory(true); setExpanded(false); setDisplayList(display.slice(0, 3)); }}>
          <View className="func-ico">🗂</View>
          <View className="func-name">历史对话</View>
          <View className="func-sub">{sessions.length} 段</View>
        </View>
        <View className="func" onClick={() => { setShowWatermark(true); setWmInput(watermark); }}>
          <View className="func-ico">✒️</View>
          <View className="func-name">我的水印</View>
          <View className="func-sub">{watermark || '未设置'}</View>
        </View>
        <View className="func" onClick={() => setShowAbout(true)}>
          <View className="func-ico">ℹ️</View>
          <View className="func-name">关于</View>
          <View className="func-sub">小程序</View>
        </View>
      </View>

      {/* 历史对话抽屉 */}
      <Popup show={showHistory} position="right" onClose={() => setShowHistory(false)}>
        <View className="ed-bar">
          <Text className="ed-title kai">历史对话</Text>
          <Text className="ed-close" onClick={() => setShowHistory(false)}>
            ✕
          </Text>
        </View>
        <ScrollView scrollX className="filter-bar">
          <Text
            className={`filter ${filter === 'all' ? 'on' : ''}`}
            onClick={() => setFilterFn('all')}
          >
            全部
          </Text>
          <Text
            className={`filter ${filter === 'favorite' ? 'on' : ''}`}
            onClick={() => setFilterFn('favorite')}
          >
            ★ 收藏
          </Text>
          {tagOptions.map((t) => (
            <Text
              key={t}
              className={`filter ${filter === t ? 'on' : ''}`}
              onClick={() => setFilterFn(t)}
            >
              {t}
            </Text>
          ))}
        </ScrollView>

        {loading && <View className="loading kai">查阅存档中…</View>}

        {!loading && (
          <ScrollView scrollY className="list">
            {displayList.map((item) => (
              <View
                key={item.session_id}
                className="item"
                onClick={() => openSession(item.session_id)}
              >
                <View className="row1">
                  <Text className="t-name kai">{item.thinker}</Text>
                  <Text className="t-mode kai">{item.modeName}</Text>
                  <Text
                    className={`t-fav ${item.favorite ? 'on' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(item.session_id);
                    }}
                  >
                    {item.favorite ? '★' : '☆'}
                  </Text>
                </View>
                {item.preview && <View className="t-preview">{item.preview}</View>}
                <View className="row2">
                  {item.topic && <Text className="t-topic kai">题：{item.topic}</Text>}
                  <Text className="t-turns kai">{item.turns} 言</Text>
                  <Text className="t-time">{item.time}</Text>
                </View>
                {item.tags && item.tags.length > 0 && (
                  <View className="tags">
                    {item.tags.map((t, i) => (
                      <Text key={i} className="tag">
                        {t}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
            ))}

            {display.length > 3 && !expanded && (
              <View className="expand-more" onClick={toggleExpand}>
                展开更多（{display.length - 3}）
              </View>
            )}
            {display.length === 0 && (
              <View className="empty kai">
                {filter === 'all' ? '尚无对话存档' : '没有符合条件的会话'}
              </View>
            )}
          </ScrollView>
        )}
      </Popup>

      {/* 我的水印 */}
      <Popup show={showWatermark} position="bottom" onClose={() => setShowWatermark(false)}>
        <View className="ed-bar">
          <Text className="ed-title kai">我的水印</Text>
          <Text className="ed-close" onClick={() => setShowWatermark(false)}>
            ✕
          </Text>
        </View>
        <View className="wm-body">
          <View className="ed-label">分享卡片上的署名（最多 20 字）</View>
          <Input
            className="ed-input"
            placeholder="如：东坡居士 / 你的昵称"
            placeholderClass="ed-ph"
            value={wmInput}
            maxlength="20"
            onInput={(e) => setWmInput(e.detail.value)}
          />
          <View className="wm-preview">署名 · {wmInput || '未设置'}</View>
        </View>
        <View className="ed-foot">
          <Button className="d-btn" onClick={saveWatermark}>
            保存
          </Button>
        </View>
      </Popup>

      {/* 关于 */}
      <Popup show={showAbout} position="bottom" onClose={() => setShowAbout(false)}>
        <View className="ed-bar">
          <Text className="ed-title kai">关于网页版</Text>
          <Text className="ed-close" onClick={() => setShowAbout(false)}>
            ✕
          </Text>
        </View>
        <View className="about-body">
          <View className="about-logo kai">遍览先贤</View>
          <View className="about-desc">
            与古今中外思想家对话——问难、对席、会饮、偶得。每一次回答皆可生成卡片，加上你的署名分享给同好。
          </View>
          <View className="about-ver">版本 1.0.0</View>
        </View>
      </Popup>

    </View>
  );
}
