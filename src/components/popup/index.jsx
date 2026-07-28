import { View } from '@tarojs/components';
import './index.scss';

// 跨端弹层（替代 van-popup）。
// props:
//   show: boolean
//   position: 'bottom' | 'right'
//   onClose: () => void
//   className: 额外类名
// 点击遮罩关闭；点击面板内部不关闭（stopPropagation）
export default function Popup({ show, position = 'bottom', onClose, children, className = '' }) {
  if (!show) return null;
  return (
    <View className="ui-popup-mask" onClick={onClose}>
      <View
        className={`ui-popup-panel ui-popup-${position} ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </View>
    </View>
  );
}
