import Taro, { useLaunch } from '@tarojs/taro';
import { hasApiConfig } from './utils/api-config';
import { fitViewport } from './utils/fit-viewport';
import './app.scss';

function App({ children }) {
  // 桌面端把布局基准收成手机宽度，避免整窗撑大
  fitViewport();

  useLaunch(() => {
    console.log('思想家AI App launched.');
    // 首次打开未配置 API 时，引导到配置页
    if (!hasApiConfig()) {
      try {
        Taro.reLaunch({ url: '/pages/setup/index' });
      } catch (e) {}
    }
  });

  return children;
}

export default App;
