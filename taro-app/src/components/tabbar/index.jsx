import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import './index.scss';

const TABS = [
  { key: 'home', label: '对偶', url: '/pages/home/index' },
  { key: 'huiyin', label: '会饮', url: '/pages/huiyin/index' },
  { key: 'thinkers', label: '思想家', url: '/pages/thinkers/index' },
  { key: 'settings', label: '设置', url: '/pages/settings/index' },
];

export default function Tabbar({ current }) {
  const go = (url) => {
    if (url === current) return;
    // 跨端通用：用 redirectTo 切换 tab（不依赖原生 tabBar）
    Taro.redirectTo({ url });
  };

  return (
    <View className="tabbar">
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
  );
}
