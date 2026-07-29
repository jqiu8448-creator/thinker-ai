import { useEffect } from 'react';
import Taro, { useLaunch } from '@tarojs/taro';
import { fitViewport } from './utils/fit-viewport';
import { applyFontScaleToDom } from './utils/global';
import './app.scss';

function App({ children }) {
  // 桌面端把布局基准收成手机宽度，避免整窗撑大
  useEffect(() => {
    fitViewport();
    applyFontScaleToDom();
  }, []);

  useLaunch(() => {
    console.log('思想家AI App launched.');
    // 配置引导已迁移至首页弹窗，不再跳转
  });

  return children;
}

export default App;
