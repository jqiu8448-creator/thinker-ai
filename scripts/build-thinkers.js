/**
 * 思想家数据打包脚本（开源网页版专用）
 *
 * 复用 server/lib/data.js 的解析逻辑，把 server/data/thinker_profiles 下的
 * 137 位思想家 SKILL.md 与话题速查表，打包成一份静态 JSON：
 *   taro-app/src/data/thinkers.json
 * 网页版在浏览器内直接读取该 JSON，无需任何后端 / 文件系统。
 *
 * 用法（在仓库根目录执行）：
 *   node scripts/build-thinkers.js
 */
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const data = require(path.join(repoRoot, 'server', 'lib', 'data.js'));

const OUT_DIR = path.join(repoRoot, 'taro-app', 'src', 'data');
const OUT_FILE = path.join(OUT_DIR, 'thinkers.json');

function main() {
  const categories = data.load_topic_table().map((c) => ({
    name: c.name,
    thinkers: c.thinkers.map((t) => ({ name: t.name, summary: t.summary || '' })),
  }));

  const list = data.list_thinkers();
  const thinkers = list.map((t) => {
    const detail = data.get_thinker_detail(t.name) || {};
    // 保留完整档案正文（detail）用于对话人格；其余为卡片/详情展示字段
    return {
      name: t.name,
      summary: t.summary,
      category: t.category || '其他',
      region: t.region || (data._deriveRegion ? data._deriveRegion(t.name) : '其他'),
      country: t.country || '',
      field: t.field || '综合',
      works: t.works || [],
      // 详情页所需
      seal: detail.seal || (t.field || '').split('·')[0].slice(0, 4),
      chips: detail.chips || [],
      tagline: detail.tagline || '',
      facts: detail.facts || {},
      quote: detail.quote || '',
      quoteSrc: detail.quoteSrc || '',
      narrative: detail.narrative || '',
      narrativeLead: detail.narrativeLead || '',
      narrativeRest: detail.narrativeRest || '',
      profile: detail.profile || [],
      brief: detail.brief || t.summary,
      // 对话人格正文（SKILL.md 全文）
      skill: detail.detail || '',
    };
  });

  const payload = { categories, thinkers };

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(payload), 'utf-8');

  const sizeKB = (fs.statSync(OUT_FILE).size / 1024).toFixed(0);
  console.log(
    `✓ 已生成 ${thinkers.length} 位思想家 / ${categories.length} 个分类 → ${path.relative(repoRoot, OUT_FILE)} (${sizeKB} KB)`
  );
}

main();
