import { useState, useEffect, useRef } from 'react';
import { View, Text, Input, Button, ScrollView } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { callCloud } from '@/utils/cloud';
import { getGlobal } from '@/utils/global';
import { ensureApiConfig } from '@/utils/api-config';
import './index.scss';

function modeName(mode) {
  return mode === 'dubai'
    ? '独白'
    : mode === 'oude'
    ? '偶得'
    : mode === 'huiyin'
    ? '会饮'
    : '对席';
}

export default function Chat() {
  const router = useRouter();
  const params = router.params || {};

  const [thinker, setThinker] = useState(decodeURIComponent(params.thinker || ''));
  const [mode, setMode] = useState(params.mode || 'duixi');
  const [modeNameState, setModeName] = useState(modeName(params.mode || 'duixi'));
  const [topic, setTopic] = useState(decodeURIComponent(params.topic || ''));
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [sessionId, setSessionId] = useState(decodeURIComponent(params.sessionId || ''));
  const [typing, setTyping] = useState(false);
  const [welcome, setWelcome] = useState(true);
  const [scrollTarget, setScrollTarget] = useState('');

  const seqRef = useRef(0);

  const addMsg = (role, content, th) => {
    const id = seqRef.current++;
    setMessages((prev) => prev.concat([{ id, role, content, thinker: th }]));
    setWelcome(false);
    setScrollTarget('msg-' + id);
  };

  const addMultiMsg = (replies, m) => {
    const id = seqRef.current++;
    setMessages((prev) => prev.concat([{ id, role: 'multi', replies, mode: m }]));
    setWelcome(false);
    setScrollTarget('msg-' + id);
  };

  const renderReply = (r) => {
    if (r.replies && r.replies.length) addMultiMsg(r.replies, r.mode);
    else if (r.reply) addMsg('assistant', r.reply, r.thinker);
    else addMsg('system', (r && r.error) || '思想家未能作答，请再试一次');
  };

  // 初次加载：从历史进入 or 从推荐进入
  useEffect(() => {
    const sid = decodeURIComponent(params.sessionId || '');
    if (sid) {
      setSessionId(sid);
      getGlobal().lastSessionId = sid;
      Taro.setNavigationBarTitle({ title: '历史对话' });
      callCloud('get_session', { session_id: sid }).then((r) => {
        if (!r || !r.ok) {
          addMsg('system', (r && r.error) || '未能读取该对话');
          return;
        }
        const m = r.mode || 'duixi';
        setThinker(r.thinker || '');
        setMode(m);
        setModeName(modeName(m));
        setTopic(r.topic || '');
        Taro.setNavigationBarTitle({ title: r.thinker || '历史对话' });
        (r.history || []).forEach((msg) => {
          const role =
            msg.role === 'user' ? 'user' : msg.thinker ? 'assistant' : 'system';
          addMsg(role, msg.content, msg.thinker);
        });
      });
      return;
    }

    const t = decodeURIComponent(params.topic || '');
    const th = decodeURIComponent(params.thinker || '');
    const m = params.mode || 'duixi';
    if (!ensureApiConfig()) return;
    setMode(m);
    setModeName(modeName(m));
    Taro.setNavigationBarTitle({ title: th || '思想家AI' });
    if (t) callChat(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onInput = (e) => setInputValue(e.detail.value);

  const onSend = () => {
    const text = (inputValue || '').trim();
    if (!text || typing) return;
    setInputValue('');
    callChat(text);
  };

  const callChat = (text) => {
    addMsg('user', text);
    setTyping(true);
    callCloud('chat', {
      message: text,
      thinker,
      mode,
      topic,
      sessionId,
    }).then((r) => {
      setTyping(false);
      if (!r) return;
      if (!r.ok) {
        addMsg('system', r.error || '请求失败，请稍后再试');
        return;
      }
      setSessionId(r.sessionId);
      getGlobal().lastSessionId = r.sessionId;
      renderReply(r);
    });
  };

  return (
    <View className="container">
      <ScrollView
        className="chat-area"
        scrollY
        scrollWithAnimation
        scrollIntoView={scrollTarget}
      >
        {welcome && (
          <View className="welcome">
            <View className="w-icon">📜</View>
            <View className="w-title kai">{thinker}</View>
            <View className="w-desc kai">
              与{thinker}
              {modeNameState}，说出你的话题或困惑
            </View>
          </View>
        )}

        {messages.map((item) => {
          if (item.role === 'user') {
            return (
              <View key={item.id} id={'msg-' + item.id} className="msg user">
                {item.content}
              </View>
            );
          }
          if (item.role === 'assistant') {
            return (
              <View key={item.id} id={'msg-' + item.id} className="msg assistant">
                {item.thinker && <View className="thinker-label kai">{item.thinker}</View>}
                <Text className="content" userSelect>
                  {item.content}
                </Text>
              </View>
            );
          }
          if (item.role === 'multi') {
            return (
              <View key={item.id} id={'msg-' + item.id} className="msg multi">
                <View className="multi-head kai">
                  {item.mode === 'huiyin' ? '会饮 · 思想交锋' : '偶得 · 多视角'}
                </View>
                {(item.replies || []).map((rp, i) => (
                  <View key={i} className="bubble">
                    <View className="b-name kai">
                      {rp.thinker}
                      {rp.round && <Text className="round-tag">第{rp.round}轮</Text>}
                    </View>
                    <Text className="content" userSelect>
                      {rp.content}
                    </Text>
                  </View>
                ))}
              </View>
            );
          }
          return (
            <View key={item.id} id={'msg-' + item.id} className="msg system">
              {item.content}
            </View>
          );
        })}

        {typing && <View className="typing kai">思想家正在思考…</View>}
      </ScrollView>

      <View className="input-area">
        <Input
          className="input kai"
          value={inputValue}
          placeholder="说出你的话题或困惑…"
          placeholderClass="ph"
          onInput={onInput}
          onConfirm={onSend}
          confirmType="send"
        />
        <Button className="send-btn" onClick={onSend}>
          发送
        </Button>
      </View>
    </View>
  );
}
