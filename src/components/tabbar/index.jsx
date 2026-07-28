import { useState, useEffect } from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { list_sessions } from '@/utils/store';
import { MODE_NAME, fmtTime } from '@/utils/modes';
import './index.scss';

const TABS = [
  { key: 'home', label: '首页', url: '/pages/home/index' },
  { key: 'huiyin', label: '清谈', url: '/pages/huiyin/index' },
  { key: 'thinkers', label: '思想家', url: '/pages/thinkers/index' },
  { key: 'settings', label: '设置', url: '/pages/settings/index' },
];

export default function Tabbar({ current, hideOnMobile }) {
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    try {
      setSessions(list_sessions(12) || []);
    } catch (e) {
      setSessions([]);
    }
  }, [current]);

  const go = (url) => {
    if (!url) return;
    const currentpage = Taro.getCurrentPages();
    const currentRoute = currentpage.length ? '/' + currentpage[currentpage.length - 1].route : '';
    if (url === currentRoute) return;
    Taro.redirectTo({ url });
  };

  const openSession = (sid) => {
    Taro.navigateTo({ url: `/pages/huiyin/index?sessionId=${encodeURIComponent(sid)}` });
  };

  return (
    <View className={`tabbar ${hideOnMobile ? 'hide-mobile' : ''}`}>
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
