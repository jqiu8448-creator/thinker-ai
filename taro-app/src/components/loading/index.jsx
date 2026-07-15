import { View, Text } from '@tarojs/components';
import './index.scss';

// 跨端加载指示（替代 van-loading）。
export default function Loading({ color = '#c8a45c', text = '' }) {
  return (
    <View className="ui-loading">
      <View className="ui-spin" style={{ borderTopColor: color }} />
      {text ? <Text className="ui-loading-text">{text}</Text> : null}
    </View>
  );
}
