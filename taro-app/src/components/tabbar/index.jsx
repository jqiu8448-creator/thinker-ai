import { useState, useEffect } from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { list_sessions } from '@/utils/store';
import './index.scss';

const TABS = [
  { key: 'home', label: '对偶', url: '/pages/home/index' },
  { key: 'huiyin', label: '会饮', url: '/pages/huiyin/index' },
  { key: 'thinkers', label: '思想家', url: '/pages/thinkers/index' },
  { key: 'settings', label: '设置', url: '/pages/settings/index' },
];

const MODE_NAME = { duixi: '对席', dubai: '独白', oude: '偶得', huiyin: '会饮' };

function fmtTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
    if (diff < 86400 * 7) return Math.floor(diff / 86400) + ' 天前';
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } catch (e) {
    return '';
  }
}

export default function Tabbar({ current }) {
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    try {
      setSessions(list_sessions(12) || []);
    } catch (e) {
      setSessions([]);
    }
  }, [current]);

  const go = (url) => {
    if (url === current) return;
    // 跨端通用：用 redirectTo 切换（不依赖原生 tabBar）
    Taro.redirectTo({ url });
  };

  const openSession = (sid) => {
    Taro.navigateTo({ url: `/pages/chat/index?sessionId=${encodeURIComponent(sid)}` });
  };

  return (
    <View className="tabbar">
      {/* 侧栏头部：朱砂印章 + 品牌（桌面端为侧栏头，手机端隐藏） */}
      <View className="sb-head">
        <View className="sb-seal kai">思</View>
        <View className="sb-head-text">
          <View className="sb-brand kai">思想家</View>
          <View className="sb-brand-sub">AI · 与先贤对谈</View>
        </View>
      </View>

      {/* 主导航 */}
      <View className="sb-nav">
        {TABS.map((t) => (
          <View
            key={t.key}
            className={`tab-item ${current === t.key ? 'on' : ''}`}
            onClick={() => go(t.url)}
          >
            <Text className="tab-label">{t.label}</Text>
          </View>
        ))}
      </View>

      {/* 最近对话（仅桌面端侧栏显示） */}
      <View className="sb-recent">
        <View className="sb-recent-head kai">最近对话</View>
        {sessions.length === 0 ? (
          <View className="sb-recent-empty">展卷伊始，静候清谈</View>
        ) : (
          sessions.map((s) => (
            <View
              key={s.session_id}
              className="sb-session"
              onClick={() => openSession(s.session_id)}
            >
              <View className="sb-session-main">
                <View className="sb-session-name kai">
                  {s.thinker || MODE_NAME[s.mode] || '思想家'}
                </View>
                <View className="sb-session-prev">{s.preview || s.topic || '（空）'}</View>
              </View>
              <View className="sb-session-time">{fmtTime(s.updated_at)}</View>
            </View>
          ))
        )}
      </View>
    </View>
  );
}
