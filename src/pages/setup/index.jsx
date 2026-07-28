import { useState } from 'react';
import { View, Text, Input, Button } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { getApiConfig, setApiConfig } from '@/utils/api-config';
import { testConnection } from '@/utils/llm';
import './index.scss';

export default function Setup() {
  const [saved] = useState(() => getApiConfig() || {});
  const [baseUrl, setBaseUrl] = useState(saved.baseUrl || '');
  const [apiKey, setApiKey] = useState(saved.apiKey || '');
  const [model, setModel] = useState(saved.model || '');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState('');
  const [saving, setSaving] = useState(false);

  const onTest = async () => {
    if (!baseUrl || !apiKey) {
      setTestResult('请先填写 Base URL 与 API Key');
      return;
    }
    setTesting(true);
    setTestResult('连接中…');
    try {
      const detail = await testConnection({ baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), model: model.trim() });
      setTestResult('✓ ' + detail);
    } catch (e) {
      setTestResult('✗ ' + (e.message || '连接失败'));
    } finally {
      setTesting(false);
    }
  };

  const onSave = () => {
    const url = baseUrl.trim();
    if (!url || !apiKey.trim()) {
      Taro.showToast({ title: 'Base URL 与 API Key 必填', icon: 'none' });
      return;
    }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      Taro.showToast({ title: 'Base URL 需以 http:// 或 https:// 开头', icon: 'none' });
      return;
    }
    setSaving(true);
    setApiConfig({ baseUrl: url, apiKey: apiKey.trim(), model: model.trim() });
    Taro.showToast({ title: '已保存', icon: 'success' });
    setTimeout(() => {
      Taro.reLaunch({ url: '/pages/home/index' });
    }, 600);
  };

  return (
    <View className="setup">
      <View className="s-brand">
        <View className="s-title kai">思想家 · AI</View>
        <View className="s-sub kai">与百位先贤对谈 · 网页版</View>
      </View>

      <View className="s-card">
        <View className="s-card-title kai">配置你的 AI 接口</View>
        <View className="s-tip">
          本应用完全在浏览器内运行，请填写你自己的 OpenAI 兼容接口。
          配置仅保存在本机浏览器，不会上传任何服务器。
        </View>

        <View className="s-label">Base URL（含 /v1）</View>
        <Input
          className="s-input"
          placeholder="https://api.openai.com/v1"
          placeholderClass="s-ph"
          value={baseUrl}
          onInput={(e) => setBaseUrl(e.detail.value)}
        />

        <View className="s-label">API Key</View>
        <Input
          className="s-input"
          placeholder="sk-..."
          placeholderClass="s-ph"
          password
          value={apiKey}
          onInput={(e) => setApiKey(e.detail.value)}
        />

        <View className="s-label">模型名</View>
        <Input
          className="s-input"
          placeholder="gpt-3.5-turbo / deepseek-chat"
          placeholderClass="s-ph"
          value={model}
          onInput={(e) => setModel(e.detail.value)}
        />

        <View className="s-test">
          <Button className="s-test-btn" loading={testing} onClick={onTest}>
            测试连接
          </Button>
          {testResult && <Text className="s-test-result">{testResult}</Text>}
        </View>
      </View>

      <Button className="s-save" loading={saving} onClick={onSave}>
        保存并进入
      </Button>

      <View className="s-foot kai">兼容 OpenAI / DeepSeek / 通义 / 月之暗面 等</View>
    </View>
  );
}
