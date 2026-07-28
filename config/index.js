const path = require('path');

const config = {
  projectName: 'taro-app',
  date: '2026-7-11',
  designWidth: 750,
  deviceRatio: {
    640: 2.34 / 2,
    750: 1,
    828: 1.81 / 2,
  },
  sourceRoot: 'src',
  outputRoot: 'dist',
  framework: 'react',
  compiler: 'vite',
  cache: {
    enable: false,
  },
  alias: {
    '@': path.resolve(__dirname, '..', 'src'),
  },
  plugins: ['@tarojs/plugin-platform-weapp', '@tarojs/plugin-platform-h5'],
  defineConstants: {},
  // 构建期注入 API_BASE（后端地址）。默认本地；生产用 API_BASE=公网地址 npm run build:h5
  env: {
    API_BASE: JSON.stringify(process.env.API_BASE || 'http://localhost:3000'),
  },
  copy: {
    patterns: [],
    options: {},
  },
  sass: {
    // 全局注入主题变量，页面 scss 可直接使用 var(--xxx)
    resource: path.resolve(__dirname, '..', 'src/styles/theme.scss'),
  },
  mini: {
    postcss: {
      pxtransform: { enable: true, config: {} },
      cssModules: { enable: false, config: {} },
    },
  },
  h5: {
    // 哈希路由：可直接部署到 GitHub Pages / 任意静态托管（含子路径），无需服务端 fallback
    router: { mode: 'hash' },
    // 相对路径：产物可在任意子目录下以静态文件方式打开
    publicPath: './',
    staticDirectory: 'static',
    postcss: {
      pxtransform: { enable: true, config: {} },
      cssModules: { enable: false, config: {} },
    },
  },
};

module.exports = config;
