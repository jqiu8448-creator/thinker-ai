import { useState, useEffect } from 'react';
import Taro, { useLaunch } from '@tarojs/taro';
import { fitViewport } from './utils/fit-viewport';
import { applyFontScaleToDom } from './utils/global';
import Tabbar from './components/tabbar';
import './app.scss';

const ROUTE_TO_TAB = {
  'pages/home/index': 'home',
  'pages/huiyin/index': 'huiyin',
  'pages/thinkers/index': 'thinkers',
  'pages/settings/index': 'settings',
};

function App({ children }) {
  const [current, setCurrent] = useState('home');
  const [showTabbar, setShowTabbar] = useState(true);

  useEffect(() => {
    fitViewport();
    applyFontScaleToDom();
  }, []);

  // 页面切换时更新当前标签
  useEffect(() => {
    const pages = Taro.getCurrentPages();
    if (pages.length) {
      const route = pages[pages.length - 1].route;
      const tab = ROUTE_TO_TAB[route];
      if (tab) {
        setCurrent(tab);
        setShowTabbar(true);
      } else {
        setShowTabbar(false);
      }
    }
  }, [children]);

  useLaunch(() => {
    // 配置引导已迁移至首页弹窗，不再跳转
  });

  return (
    <>
      {children}
      {showTabbar && <Tabbar current={current} />}
    </>
  );
}

export default App;
