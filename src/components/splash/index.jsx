import { useState, useEffect } from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import './splash.scss';

/**
 * 开屏动画组件
 * - 水墨风格：朱砂印章浮现 → 墨色晕染 → 标题逐字淡入
 * - 首次访问展示，之后记录在 localStorage，跳过动画
 * - 点击任意位置可跳过
 */
export default function Splash({ onEnter }) {
  const [phase, setPhase] = useState(0);
  // 0: 初始
  // 1: 印章浮现 + 墨晕扩散 (0-0.8s)
  // 2: 标题逐字出现 (0.8-1.8s)
  // 3: 副标题 + 进入提示 (1.8-2.5s)
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // 检查是否已经看过开屏（今天内第二次访问跳过）
    try {
      const last = Taro.getStorageSync('splash_shown_date');
      const today = new Date().toDateString();
      if (last === today) {
        // 今天已经看过，直接跳过，但保留淡入效果
        setVisible(false);
        setTimeout(() => onEnter && onEnter(), 100);
        return;
      }
    } catch (e) {}

    // 动画序列
    const t1 = setTimeout(() => setPhase(1), 100);
    const t2 = setTimeout(() => setPhase(2), 900);
    const t3 = setTimeout(() => setPhase(3), 2000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEnter = () => {
    // 记录今天已看过
    try {
      Taro.setStorageSync('splash_shown_date', new Date().toDateString());
    } catch (e) {}
    setVisible(false);
    setTimeout(() => onEnter && onEnter(), 400);
  };

  if (!visible && phase === 0) return null;

  return (
    <View
      className={`splash-wrap ${visible ? 'show' : 'hide'}`}
      onClick={handleEnter}
    >
      {/* 宣纸底纹背景 */}
      <View className="splash-bg" />

      {/* 墨色晕染 */}
      <View className={`ink-spread ${phase >= 1 ? 'spread' : ''}`}>
        <View className="ink-blob blob-1" />
        <View className="ink-blob blob-2" />
        <View className="ink-blob blob-3" />
      </View>

      {/* 朱砂印章 */}
      <View className={`seal-wrap ${phase >= 1 ? 'in' : ''}`}>
        <View className="seal">
          <Text className="seal-char">思</Text>
        </View>
      </View>

      {/* 标题 */}
      <View className={`splash-title ${phase >= 2 ? 'in' : ''}`}>
        <Text className="title-main kai">
          <Text className="title-char" style={{ animationDelay: '0s' }}>对</Text>
          <Text className="title-char" style={{ animationDelay: '0.12s' }}>偶</Text>
          <Text className="title-dot">·</Text>
          <Text className="title-char" style={{ animationDelay: '0.24s' }}>思</Text>
          <Text className="title-char" style={{ animationDelay: '0.36s' }}>想</Text>
          <Text className="title-char" style={{ animationDelay: '0.48s' }}>家</Text>
        </Text>
      </View>

      {/* 副标题 */}
      <View className={`splash-sub ${phase >= 3 ? 'in' : ''}`}>
        <Text className="sub-text kai">墨香入室，与古贤共语</Text>
      </View>

      {/* 分隔线 */}
      <View className={`splash-divider ${phase >= 3 ? 'in' : ''}`}>
        <View className="divider-line" />
        <Text className="divider-mark">印</Text>
        <View className="divider-line" />
      </View>

      {/* 进入提示 */}
      <View className={`enter-hint ${phase >= 3 ? 'in' : ''}`}>
        <Text className="hint-text kai">— 轻触入席 —</Text>
      </View>
    </View>
  );
}
