import { useState, useMemo } from 'react';
import { View, Text, Input, ScrollView } from '@tarojs/components';
import './index.scss';

// 思想家卡片网格（跨端）。属性：
//   thinkers: [{name, region, category, field, summary, works}]
//   searchable: 是否显示搜索框
//   multi: 多选模式（点击触发 onToggle，并显示选中态）
//   selected: string[]  已选名字（multi 模式下高亮）
//   onPick: (name) => void   单选点击
//   onToggle: (name) => void 多选切换
export default function ThinkerGrid({
  thinkers = [],
  searchable = false,
  multi = false,
  selected = [],
  onPick,
  onToggle,
}) {
  const [kw, setKw] = useState('');

  const list = useMemo(() => {
    const enriched = thinkers.map((t) => ({
      ...t,
      worksText: t.works && t.works.length ? t.works.join('、') : '—',
    }));
    if (!searchable || !kw.trim()) return enriched;
    const q = kw.trim();
    return enriched.filter((t) =>
      [t.name, t.summary, t.field, t.region, t.worksText]
        .filter(Boolean)
        .join(' ')
        .includes(q)
    );
  }, [thinkers, searchable, kw]);

  const isSel = (name) => selected.indexOf(name) >= 0;

  const handleTap = (name) => {
    if (multi) {
      if (onToggle) onToggle(name);
    } else if (onPick) {
      onPick(name);
    }
  };

  return (
    <View className="tg">
      {searchable && (
        <View className="tg-search-bar">
          <Input
            className="tg-search"
            placeholder="搜思想家 / 领域 / 著作"
            placeholderClass="tg-ph"
            value={kw}
            onInput={(e) => setKw(e.detail.value)}
          />
        </View>
      )}
      <ScrollView scrollY className="tg-scroll">
        <View className="tg-grid">
          {list.map((t) => {
            const sel = multi && isSel(t.name);
            return (
              <View key={t.name} className="tg-cell">
                <View
                  className={`tg-card ${sel ? 'on' : ''}`}
                  onClick={() => handleTap(t.name)}
                >
                  {t.region && <View className="tg-badge kai">{t.region}</View>}
                  {sel && <View className="tg-tick kai">✓</View>}
                  <Text className="tg-name kai">{t.name}</Text>
                  {t.category && <Text className="tg-cat">{t.category}</Text>}
                  <View className="tg-meta">
                    <Text className="tg-field">{t.field || '综合'}</Text>
                    {t.worksText !== '—' && <Text className="tg-dot">·</Text>}
                    {t.worksText !== '—' && <Text className="tg-works">{t.worksText}</Text>}
                  </View>
                </View>
              </View>
            );
          })}
          {list.length === 0 && <Text className="tg-empty kai">未寻得此人</Text>}
        </View>
      </ScrollView>
    </View>
  );
}
