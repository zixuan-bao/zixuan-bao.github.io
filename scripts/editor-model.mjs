import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import YAML from 'yaml';
import TOML from '@iarna/toml';

export const sectionKeys = ['about', 'research', 'notes', 'thoughts', 'writings', 'gallery', 'resources'];
export const contentKeys = ['research', 'notes', 'thoughts', 'writings', 'resources'];
export const fontKeys = ['sans', 'serif', 'literary', 'mono', 'inherit'];
const dataKeys = ['profile', 'home', 'about', 'design'];
const safeId = /^(about|research|notes|thoughts|writings|gallery|resources)\/(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.md$/i;
export function slugify(value) {
  return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);
}
export function parseContent(text) {
  const match = text.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  if (!match) throw new Error('This content file does not use supported YAML front matter.');
  return { meta: YAML.parse(match[1]) || {}, body: match[2].trim() };
}
export function formatContent(meta, body = '') {
  return `---\n${YAML.stringify(meta, { lineWidth: 0 }).trimEnd()}\n---\n\n${body.trim()}\n`;
}
const clone = value => JSON.parse(JSON.stringify(value));
function must(condition, message) { if (!condition) throw new Error(message); }
function bounded(value, min, max, label) {
  must(Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max, `${label} must be between ${min} and ${max}.`);
  return Number(value);
}
export function safeUrl(value, image = false) {
  const text = String(value || '').trim();
  if (!text) return '';
  must(!/[\u0000-\u001f\\]/.test(text), 'The link contains invalid characters.');
  if (text.startsWith('/') && !text.startsWith('//') && !decodeURIComponent(text).split(/[/?#]/).includes('..')) return text;
  const parsed = new URL(text);
  must(['http:', 'https:'].includes(parsed.protocol), image ? 'Use a local image or an HTTP(S) image URL.' : 'Use an HTTP(S) link or a local website path.');
  return text;
}
function validateDate(value) {
  if (!value) return '';
  must(/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value).valueOf()) && new Date(value).toISOString().slice(0, 10) === value, 'Use dates in YYYY-MM-DD format.');
  return value;
}
export function createModel(root) {
  root = path.resolve(root);
  const resolve = relative => {
    const target = path.resolve(root, relative);
    must(target.startsWith(root + path.sep), 'Path is outside the website folder.');
    return target;
  };
  const read = relative => fs.readFileSync(resolve(relative), 'utf8');
  const json = key => JSON.parse(read(`data/${key}.json`));
  const content = id => { must(safeId.test(id), 'Invalid content identifier.'); return parseContent(read(`content/${id}`)); };
  function backup(relative) {
    const source = resolve(relative);
    if (!fs.existsSync(source)) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomBytes(3).toString('hex');
    const destination = resolve(`.tools/editor-history/${stamp}/${relative}`);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
  function write(relative, text) {
    backup(relative);
    const destination = resolve(relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const temporary = destination + '.editor-tmp';
    fs.writeFileSync(temporary, text, 'utf8');
    fs.renameSync(temporary, destination);
  }
  function documents() {
    const records = [];
    function walk(relative) {
      for (const entry of fs.readdirSync(resolve(`content/${relative}`), { withFileTypes: true })) {
        const id = `${relative}/${entry.name}`;
        if (entry.isDirectory()) walk(id);
        else if (entry.name.endsWith('.md') && safeId.test(id)) {
          const parsed = content(id);
          const parts = id.split('/');
          records.push({ id, section: parts[0], topic: parts.length > 2 ? parts[1] : '', type: entry.name === '_index.md' ? (parts.length === 2 ? 'section' : 'topic') : parts[0] === 'gallery' ? 'city' : 'entry', ...parsed });
        }
      }
    }
    sectionKeys.forEach(walk);
    return records.sort((a, b) => (Number(a.meta.weight || 0) - Number(b.meta.weight || 0)) || String(a.meta.title).localeCompare(String(b.meta.title)));
  }
  function revision() {
    const hash = crypto.createHash('sha256');
    for (const key of dataKeys) hash.update(read(`data/${key}.json`));
    hash.update(read('hugo.toml'));
    for (const record of documents()) hash.update(read(`content/${record.id}`));
    return hash.digest('hex');
  }
  function media() {
    const files = [];
    function walk(relative) {
      for (const item of fs.readdirSync(resolve(`static/${relative}`), { withFileTypes: true })) {
        const id = `${relative}/${item.name}`;
        if (item.isDirectory()) walk(id);
        else if (/\.(png|jpe?g|webp|gif|avif|svg)$/i.test(item.name)) files.push({ name: item.name, url: `/${id}`, size: fs.statSync(resolve(`static/${id}`)).size });
      }
    }
    walk('images');
    return files;
  }
  function state() {
    const config = TOML.parse(read('hugo.toml'));
    const records = documents();
    return { revision: revision(), profile: json('profile'), home: json('home'), about: json('about'), design: json('design'), sections: records.filter(item => item.type === 'section').map(item => ({ ...item, in_menu: (config.menus?.main || []).some(menu => menu.pageRef === `/${item.section}`), menu_label: (config.menus?.main || []).find(menu => menu.pageRef === `/${item.section}`)?.name || item.meta.title, order: (config.menus?.main || []).find(menu => menu.pageRef === `/${item.section}`)?.weight || 100 })).sort((a, b) => a.order - b.order), records: records.filter(item => item.type !== 'section'), media: media(), site: { url: config.baseURL, demo: config.params.demo }, root };
  }
  function checkRevision(expected) {
    if (expected !== revision()) { const error = new Error('内容已在其他地方更新。请刷新编辑器后再保存，以免覆盖修改。'); error.status = 409; throw error; }
  }
  function saveSettings(key, value, expected) {
    checkRevision(expected);
    must(dataKeys.includes(key) || key === 'sections', 'Unknown settings group.');
    value = clone(value);
    if (key === 'profile') {
      must(String(value.display_name || '').trim(), '请输入显示名称。');
      must(String(value.full_name || '').trim(), '请输入姓名。');
      value.avatar = safeUrl(value.avatar, true);
      must(value.avatar, '请选择头像。');
      value.socials = (value.socials || []).map(item => ({ ...item, url: safeUrl(item.url) }));
      must(!value.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email), '请输入有效邮箱，或留空。');
      const config = TOML.parse(read('hugo.toml'));
      config.title = value.display_name;
      config.copyright = value.full_name;
      config.params.demo = Boolean(value.show_demo_notice);
      write('hugo.toml', TOML.stringify(config));
    }
    if (key === 'home') {
      value.hero_image = safeUrl(value.hero_image, true);
      must(value.hero_image, '请选择首页封面。');
      value.hero_height = bounded(value.hero_height, 160, 700, '封面高度');
      must(['center', 'top', 'bottom', 'left', 'right'].includes(value.hero_position), 'Invalid image position.');
    }
    if (key === 'about') {
      must(['profile-left', 'profile-right', 'profile-top'].includes(value.layout), 'Invalid About layout.');
      must(Array.isArray(value.blocks), 'About blocks must be a list.');
      for (const block of value.blocks) {
        must(['text', 'columns', 'image', 'links', 'timeline'].includes(block.type), 'Invalid block type.');
        if (block.image) block.image = safeUrl(block.image, true);
        if (block.type === 'links') for (const item of block.items || []) item.url = safeUrl(item.url);
      }
    }
    if (key === 'design') {
      for (const field of ['accent', 'accent_dark']) must(/^#[a-f0-9]{6}$/i.test(value[field]), '请选择有效颜色。');
      for (const field of ['body_font', 'heading_font']) must(fontKeys.includes(value[field]) && value[field] !== 'inherit', 'Invalid font.');
      must(fontKeys.includes(value.caption_font) && value.caption_font !== 'inherit', 'Invalid caption font.');
      for (const [field, min, max] of [['body_size', 12, 28], ['hero_size', 28, 120], ['section_size', 22, 80], ['item_size', 14, 40], ['caption_size', 10, 24], ['nav_size', 11, 24], ['image_radius', 0, 40]]) value[field] = bounded(value[field], min, max, field);
      for (const scope of value.scopes || []) {
        must(sectionKeys.includes(scope.section), 'Invalid typography scope.');
        must(fontKeys.includes(scope.title_font) && fontKeys.includes(scope.text_font), 'Invalid scoped font.');
        scope.title_size = bounded(scope.title_size, 22, 80, '栏目标题字号');
        scope.page_title_size = bounded(scope.page_title_size || 68, 28, 100, '栏目页面标题字号');
        scope.text_size = bounded(scope.text_size, 11, 28, '栏目正文字号');
      }
    }
    if (key === 'sections') {
      must(Array.isArray(value) && value.length === sectionKeys.length && new Set(value.map(item => item.section)).size === sectionKeys.length, '请保留七个栏目的设置；可以选择隐藏。');
      const config = TOML.parse(read('hugo.toml'));
      const updates = [];
      value.forEach((item, index) => {
        must(sectionKeys.includes(item.section), 'Unknown section.');
        const old = content(`${item.section}/_index.md`);
        const meta = { ...old.meta, title: String(item.title || '').trim(), description: String(item.description || ''), kicker: String(item.kicker || ''), show_home: Boolean(item.show_home), preview_count: bounded(item.preview_count || 3, 1, 12, '首页显示条数'), more_label: String(item.more_label || 'More'), weight: (index + 1) * 10 };
        must(meta.title, '栏目名称不能为空。');
        updates.push([`content/${item.section}/_index.md`, formatContent(meta, old.body)]);
      });
      config.menus.main = value.filter(item => item.in_menu).map((item, index) => ({ name: String(item.menu_label || item.title), pageRef: `/${item.section}`, weight: (index + 1) * 10 }));
      must(config.menus.main.length > 0, '至少保留一个导航栏目。');
      updates.forEach(([file, text]) => write(file, text));
      write('hugo.toml', TOML.stringify(config));
    } else write(`data/${key}.json`, JSON.stringify(value, null, 2) + '\n');
    return state();
  }
  function saveRecord(record, expected) {
    checkRevision(expected);
    const existing = record.id ? documents().find(item => item.id === record.id) : null;
    must(!record.id || existing, '条目已不存在，请刷新。');
    const type = existing?.type || record.type;
    const section = existing?.section || record.section;
    must(['entry', 'topic', 'city'].includes(type), 'Invalid record type.');
    must(type === 'city' ? section === 'gallery' : contentKeys.includes(section), 'Invalid section.');
    const meta = { ...(existing?.meta || {}), ...clone(record.meta) };
    meta.title = String(meta.title || '').trim();
    must(meta.title, '标题不能为空。');
    meta.description = String(meta.description || '');
    meta.weight = bounded(meta.weight || 10, -10000, 10000, '顺序');
    for (const key of ['link', 'image', 'cover']) if (meta[key]) meta[key] = safeUrl(meta[key], key !== 'link');
    for (const key of ['date', 'lastmod']) if (meta[key]) meta[key] = validateDate(meta[key]); else delete meta[key];
    if (meta.date && meta.lastmod) must(meta.lastmod >= meta.date, '更新日期不能早于发布日期。');
    meta.authors = (meta.authors || []).map(String).filter(Boolean);
    meta.tags = (meta.tags || []).map(String).filter(Boolean);
    meta.series = (meta.series || []).map(String).filter(Boolean);
    for (const attachment of meta.attachments || []) attachment.url = safeUrl(attachment.url);
    if (!meta.link) delete meta.link;
    if (type === 'city') for (const photo of meta.photos || []) { photo.src = safeUrl(photo.src, true); must(photo.src && photo.alt, '每张照片需要图片和替代说明。'); }
    if (type === 'city' && !meta.draft) {
      meta.cover ||= meta.photos?.[0]?.src || '';
      meta.cover_alt ||= meta.photos?.[0]?.alt || '';
      must(meta.cover && meta.cover_alt, '城市相册需要封面图片和封面说明；也可以先添加一张照片作为封面。');
    }
    if (meta.image) must(meta.image_alt, '请填写条目图片的内容说明。');
    const slug = existing ? path.posix.basename(existing.id, '.md') : slugify(record.slug || meta.title) || `item-${Date.now()}`;
    let id;
    if (type === 'topic') id = existing?.id || `${section}/${slug}/_index.md`;
    else if (type === 'city') id = existing?.id || `gallery/${slug}.md`;
    else {
      const topic = String(record.topic || existing?.topic || '');
      must(documents().some(item => item.type === 'topic' && item.section === section && item.topic === topic), '请先选择或创建分类。');
      id = `${section}/${topic}/${slug}.md`;
    }
    must(safeId.test(id), 'Invalid content path.');
    if (id !== existing?.id) must(!fs.existsSync(resolve(`content/${id}`)), '该标题对应的文件名已存在，请使用不同名称。');
    write(`content/${id}`, formatContent(meta, String(record.body || '')));
    if (existing && id !== existing.id) trashFile(`content/${existing.id}`);
    return { state: state(), id };
  }
  function trashFile(relative) {
    backup(relative);
    const destination = resolve(`.tools/editor-trash/${Date.now()}-${crypto.randomBytes(3).toString('hex')}/${relative}`);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.renameSync(resolve(relative), destination);
  }
  function removeRecord(id, expected) {
    checkRevision(expected);
    const record = documents().find(item => item.id === id);
    must(record && record.type !== 'section', '不能删除整个主栏目；请在栏目设置中隐藏。');
    if (record.type === 'topic') must(!documents().some(item => item.type === 'entry' && item.section === record.section && item.topic === record.topic), '这个分类还有条目。请先移动或删除条目。');
    trashFile(`content/${id}`);
    return state();
  }
  function upload({ name, data }) {
    must(typeof data === 'string' && data.length < 22_000_000, '图片请控制在 15 MB 以内。');
    const buffer = Buffer.from(data, 'base64');
    must(buffer.length > 0 && buffer.length <= 15 * 1024 * 1024, '图片为空或过大。');
    let extension;
    if (buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) extension = 'jpg';
    else if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) extension = 'png';
    else if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') extension = 'webp';
    else if (/GIF8[79]a/.test(buffer.toString('ascii', 0, 6))) extension = 'gif';
    else if (buffer.toString('ascii', 4, 8) === 'ftyp' && /avif|avis/.test(buffer.toString('ascii', 8, 32))) extension = 'avif';
    must(extension, '请上传 JPG、PNG、WebP、GIF 或 AVIF 图片。');
    const stem = slugify(path.basename(name || 'image', path.extname(name || ''))) || 'image';
    const url = `/images/uploads/${stem}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.${extension}`;
    const target = resolve(`static${url}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, buffer);
    return { url, media: media() };
  }
  return { root, state, revision, saveSettings, saveRecord, removeRecord, upload, resolve };
}
