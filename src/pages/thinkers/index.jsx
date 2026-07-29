import { useState, useEffect, useRef } from 'react';
import { View, Text, Canvas } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { callCloud } from '@/utils/cloud';
import { getGlobal, ensureWatermark } from '@/utils/global';
import Loading from '@/components/loading';
import ThinkerGrid from '@/components/thinker-grid';
import Tabbar from '@/components/tabbar';
import './index.scss';

function countryRank(c) {
  return c === '中国' ? 0 : c === '其他' ? 3 : c === '西方' ? 2 : 1;
}

function emptyDetail(name) {
  return {
    name,
    category: '',
    country: '',
    field: '',
    seal: '',
    chips: [],
    tagline: '',
    facts: { era: '', identity: '', core: '' },
    quote: '',
    quoteSrc: '',
    narrative: '',
    narrativeLead: '',
    narrativeRest: '',
    works: [],
    summary: '',
    profile: [],
  };
}

export default function Thinkers() {
  const [thinkers, setThinkers] = useState([]);
  const [displayList, setDisplayList] = useState([]);
  const [showDetail, setShowDetail] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const detailCache = useRef({});

  useEffect(() => {
    const cached = getGlobal().thinkers;
    if (cached) {
      setThinkers(cached);
      setDisplayList(cached);
      return;
    }
    callCloud('thinkers').then((res) => {
      if (res && res.ok) {
        const list = (res.thinkers || [])
          .slice()
          .sort((a, b) => countryRank(a.country) - countryRank(b.country));
        getGlobal().thinkers = list;
        setThinkers(list);
        setDisplayList(list);
      }
    });
  }, []);

  const onTap = (name) => {
    if (!name) return;
    const hit = detailCache.current[name];
    if (hit) {
      setShowDetail(true);
      setDetailLoading(false);
      setDetail(hit);
      return;
    }
    setShowDetail(true);
    setDetailLoading(true);
    setDetail(null);
    callCloud('thinker_detail', { name }).then((res) => {
      const d = res && res.ok ? { ...res } : emptyDetail(name);
      if (res && res.ok) detailCache.current[name] = d;
      setDetailLoading(false);
      setDetail(d);
    });
  };

  const closeDetail = () => setShowDetail(false);

  const startChat = () => {
    const name = detail && detail.name;
    if (!name) return;
    setShowDetail(false);
    Taro.navigateTo({
      url: `/pages/huiyin/index?thinker=${encodeURIComponent(name)}&mode=duixi`,
    });
  };

  // ===== 分享成卡片 =====
  const shareCard = () => {
    const d = detail;
    if (!d || !d.name) return;
    Taro.showLoading({ title: '生成卡片…', mask: true });
    ensureWatermark().then((wm) => renderCard(d, wm || ''));
  };

  const renderCard = (d, wm) => {
    // H5 端直接用 DOM 获取 canvas
    if (typeof document !== 'undefined') {
      const canvas = document.getElementById('shareCanvas');
      if (!canvas || canvas.tagName.toLowerCase() !== 'canvas') {
        // Taro H5 可能用自定义元素
        const el = document.querySelector('#shareCanvas canvas') || document.querySelector('#shareCanvas');
        if (el && el.getContext) {
          drawOnCanvas(el, d, wm);
          return;
        }
      } else if (canvas.getContext) {
        drawOnCanvas(canvas, d, wm);
        return;
      }
    }
    // 小程序端用 createSelectorQuery
    Taro.createSelectorQuery()
      .select('#shareCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) {
          Taro.hideLoading();
          Taro.showToast({ title: '画布初始化失败', icon: 'none' });
          return;
        }
        drawOnCanvas(res[0].node, d, wm);
      });
  };

  const drawOnCanvas = (canvas, d, wm) => {
    const ctx = canvas.getContext('2d');
    const dpr = (typeof Taro.getWindowInfo === 'function' && Taro.getWindowInfo().pixelRatio) || 2;
    const W = 600;
    const H = drawCard(ctx, W, d, wm, true);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
    drawCard(ctx, W, d, wm, false, H);

    // H5 端：转 dataURL 下载
    if (typeof document !== 'undefined') {
      Taro.hideLoading();
      try {
        const dataURL = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `${d.name}_思想家档案.png`;
        link.href = dataURL;
        link.click();
        Taro.showToast({ title: '卡片已保存', icon: 'success' });
      } catch (e) {
        Taro.showToast({ title: '保存失败', icon: 'none' });
      }
      return;
    }

    // 小程序端
    Taro.canvasToTempFilePath({
      canvas,
      success: (r) => {
        Taro.hideLoading();
        const path = r.tempFilePath;
        if (typeof Taro.showShareImageMenu === 'function') {
          Taro.showShareImageMenu({
            path,
            fail: () => Taro.previewImage({ urls: [path] }),
          });
        } else {
          Taro.previewImage({ urls: [path] });
        }
      },
      fail: () => {
        Taro.hideLoading();
        Taro.showToast({ title: '生成失败', icon: 'none' });
      },
    });
  };

  // measure=true：仅返回画布高度；measure=false：在高度 H 的画布上绘制
  const drawCard = (ctx, W, d, wm, measure, H) => {
    if (!measure) {
      ctx.fillStyle = '#1a1714';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#c8a45c';
      ctx.lineWidth = 2;
      ctx.strokeRect(24, 24, W - 48, H - 48);
      const grad = ctx.createLinearGradient(40, 0, W - 40, 0);
      grad.addColorStop(0, '#2a2218');
      grad.addColorStop(0.5, '#c8a45c');
      grad.addColorStop(1, '#2a2218');
      ctx.fillStyle = grad;
      ctx.fillRect(40, 40, W - 80, 6);
    }

    ctx.textBaseline = 'top';
    let y = 96;
    if (!measure) {
      ctx.fillStyle = '#c8a45c';
      ctx.font = '600 52px serif';
      ctx.fillText(d.name, 56, y);
    }

    if (d.seal && !measure) {
      ctx.save();
      ctx.translate(W - 56 - 64, y);
      ctx.rotate(-0.05);
      ctx.strokeStyle = '#c8a45c';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, 64, 64);
      ctx.fillStyle = '#c8a45c';
      ctx.font = '26px serif';
      ctx.textAlign = 'center';
      const lines = [d.seal.slice(0, 2), d.seal.slice(2, 4)].filter(Boolean);
      const lh = 28;
      let ly = (64 - lines.length * lh) / 2;
      lines.forEach((ln) => {
        ctx.fillText(ln, 32, ly);
        ly += lh;
      });
      ctx.restore();
      ctx.textAlign = 'left';
    }
    y += 78;

    if (!measure) ctx.font = '22px serif';
    let cx = 56;
    (d.chips || []).forEach((c) => {
      const w = ctx.measureText(c).width + 26;
      if (!measure) {
        ctx.fillStyle = '#2b251c';
        roundRect(ctx, cx, y, w, 34, 8);
        ctx.fill();
        ctx.strokeStyle = '#4a3f2e';
        ctx.lineWidth = 1;
        roundRect(ctx, cx, y, w, 34, 8);
        ctx.stroke();
        ctx.fillStyle = '#e8dcc0';
        ctx.fillText(c, cx + 13, y + 6);
      }
      cx += w + 12;
    });
    y += 58;

    if (d.tagline) {
      if (!measure) {
        ctx.fillStyle = '#d4b06a';
        ctx.font = 'italic 26px serif';
      }
      y = wrapText(ctx, d.tagline, 56, y, W - 112, 38, 3, measure) + 16;
    }

    const facts = [
      ['时代', d.facts && d.facts.era],
      ['身份', d.facts && d.facts.identity],
      ['核心', d.facts && d.facts.core],
    ];
    const colW = (W - 112 - 32) / 3;
    let fy = y;
    facts.forEach((f, i) => {
      const fx = 56 + i * (colW + 16);
      if (!measure) {
        ctx.fillStyle = '#211c17';
        roundRect(ctx, fx, fy, colW, 104, 12);
        ctx.fill();
        ctx.fillStyle = '#8a7c5e';
        ctx.font = '20px serif';
        ctx.fillText(f[0], fx + 14, fy + 14);
        ctx.fillStyle = '#e8dcc0';
        ctx.font = '22px serif';
      }
      wrapText(ctx, f[1] || '', fx + 14, fy + 42, colW - 28, 28, 2, measure);
    });
    y = fy + 104 + 24;

    if (d.quote) {
      if (!measure) {
        ctx.strokeStyle = '#c8a45c';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(56, y + 6);
        ctx.lineTo(56, y + 58);
        ctx.stroke();
        ctx.fillStyle = '#e8dcc0';
        ctx.font = '26px serif';
      }
      y = wrapText(ctx, d.quote, 76, y, W - 132, 38, 3, measure) + 8;
      if (d.quoteSrc) {
        if (!measure) {
          ctx.fillStyle = '#8a7c5e';
          ctx.font = '20px serif';
          ctx.fillText('— ' + d.quoteSrc, 76, y);
        }
        y += 30;
      }
      y += 12;
    }

    if (d.narrativeRest) {
      if (!measure) {
        ctx.fillStyle = '#e8dcc0';
        ctx.font = '24px serif';
      }
      y = wrapText(ctx, '「' + d.narrativeRest, 56, y, W - 112, 36, 4, measure) + 14;
    }

    if (d.works && d.works.length) {
      if (!measure) {
        ctx.fillStyle = '#c8a45c';
        ctx.font = '24px serif';
        ctx.fillText('著述', 56, y);
      }
      y += 34;
      if (!measure) {
        ctx.fillStyle = '#e8dcc0';
        ctx.font = '22px serif';
      }
      const worksLine = d.works
        .slice(0, 6)
        .map((w) => '《' + w + '》')
        .join('、');
      y = wrapText(ctx, worksLine, 56, y, W - 112, 32, 2, measure);
    }

    if (measure) {
      const footY = y + 48;
      const wmY = footY + 36;
      return wm ? wmY + 44 : footY + 60;
    }

    ctx.fillStyle = '#8a7c5e';
    ctx.font = '22px serif';
    ctx.textAlign = 'center';
    ctx.fillText('遍览先贤 · 点选即谈', W / 2, y + 48);
    if (wm) {
      ctx.fillStyle = '#c8a45c';
      ctx.font = '24px serif';
      ctx.fillText('分享自 · ' + wm, W / 2, y + 84);
    }
    ctx.textAlign = 'left';
  };

  const roundRect = (ctx, x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  const wrapText = (ctx, text, x, y, maxWidth, lineHeight, maxLines, measure) => {
    const chars = String(text).split('');
    let line = '';
    let lines = 0;
    let yy = y;
    for (let i = 0; i < chars.length; i++) {
      const test = line + chars[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        if (!measure) ctx.fillText(line, x, yy);
        line = chars[i];
        yy += lineHeight;
        lines++;
        if (maxLines && lines >= maxLines - 1) {
          let rest = line + chars.slice(i + 1).join('');
          while (ctx.measureText(rest + '…').width > maxWidth && rest.length) {
            rest = rest.slice(0, -1);
          }
          if (!measure) ctx.fillText(rest + (i < chars.length - 1 ? '…' : ''), x, yy);
          return yy + lineHeight;
        }
      } else {
        line = test;
      }
    }
    if (line && !measure) ctx.fillText(line, x, yy);
    return yy + (line ? lineHeight : 0);
  };

  return (
    <View className="page page-enter">
      <Tabbar current="thinkers" />
      <View className="hint kai">遍览先贤 · 点选即谈</View>

      <View className="cards">
        <ThinkerGrid thinkers={displayList} searchable onPick={onTap} />
      </View>

      {showDetail && (
        <View className="d-mask" onClick={closeDetail}>
          <View className="d-card" onClick={(e) => e.stopPropagation()}>
            <View className="d-bar">
              <View className="d-bar-title kai">人物档案</View>
              <View className="d-close" onClick={closeDetail}>
                ✕
              </View>
            </View>

            <View className="d-scroll">
              <View className="d-body">
                {/* 左栏：人物头部 + 简介 + 事实 + 名言 + 著述（底部） */}
                <View className="d-side">
                  <View className="d-head">
                    <View className="d-name-row">
                      <View className="d-name kai">{detail && detail.name}</View>
                      {detail && detail.seal && (
                        <View className="d-seal kai">{detail.seal}</View>
                      )}
                    </View>
                    {detail && detail.chips && detail.chips.length > 0 && (
                      <View className="d-chips">
                        {(detail.chips || []).map((c, i) => (
                          <Text key={i} className="d-chip kai">
                            {c}
                          </Text>
                        ))}
                      </View>
                    )}
                  </View>

                  {!detailLoading && detail && (
                    <View className="d-side-block">
                      {detail.tagline && <View className="d-tagline kai">{detail.tagline}</View>}
                      <View className="d-facts">
                        <View className="d-fact">
                          <View className="d-fact-k">时代</View>
                          <View className="d-fact-v">{detail.facts && detail.facts.era}</View>
                        </View>
                        <View className="d-fact">
                          <View className="d-fact-k">身份</View>
                          <View className="d-fact-v">{detail.facts && detail.facts.identity}</View>
                        </View>
                        <View className="d-fact">
                          <View className="d-fact-k">核心</View>
                          <View className="d-fact-v">{detail.facts && detail.facts.core}</View>
                        </View>
                      </View>
                      {detail.quote && (
                        <View className="d-quote">
                          <View className="d-quote-text">{detail.quote}</View>
                          {detail.quoteSrc && (
                            <View className="d-quote-src kai">— {detail.quoteSrc}</View>
                          )}
                        </View>
                      )}
                    </View>
                  )}

                  {/* 著述移到左栏底部 */}
                  {!detailLoading && detail && detail.works && detail.works.length > 0 && (
                    <View className="d-side-works">
                      <View className="d-block-title kai">著述</View>
                      <View className="d-works">
                        {detail.works.map((w, i) => (
                          <View key={i} className="d-work">
                            <Text className="d-work-num kai">
                              {String(i + 1).padStart(2, '0')}
                            </Text>
                            <Text className="d-work-txt kai">《{w}》</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </View>

                {/* 右栏：仅自述展开 */}
                <View className="d-main">
                  {!detailLoading && detail && detail.narrative && (
                    <View className="d-block">
                      <View className="d-block-title kai">自述</View>
                      <View className="d-narrative">
                        {detail.narrativeLead && (
                          <Text className="d-lead kai">{detail.narrativeLead}</Text>
                        )}
                        <Text className="d-narrative-body" userSelect>
                          {detail.narrativeRest}
                        </Text>
                        <View className="d-sign kai">—— {detail.name} 自述</View>
                      </View>
                    </View>
                  )}
                </View>
              </View>

              {detailLoading && (
                <View className="d-loading kai">
                  <Loading text="查阅档案中…" />
                </View>
              )}

              <View className="d-scroll-foot" />
            </View>

            <View className="d-foot">
              <View className="d-share kai" onClick={shareCard}>
                分享
              </View>
              <View className="d-talk kai" onClick={startChat}>
                开始对话
              </View>
            </View>
          </View>
        </View>
      )}
      <Canvas type="2d" id="shareCanvas" className="share-canvas" />
    </View>
  );
}
