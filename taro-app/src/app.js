import Taro, { useLaunch } from '@tarojs/taro';
import { hasApiConfig } from './utils/api-config';
import './app.scss';

function App({ children }) {
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
