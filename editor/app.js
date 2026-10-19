(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const clone = value => JSON.parse(JSON.stringify(value));
  const labels = { profile: '个人资料', home: '首页内容', design: '字体与外观', sections: '栏目与导航', about: 'About 内容块', research: 'Research', notes: 'Notes', thoughts: 'Thoughts', writings: 'Writings', gallery: 'Gallery', resources: 'Resources', media: '图片库' };
  const descriptions = {
    profile: '修改姓名、头像、学校项目、联系方式和外部网站。',
    home: '编辑首页的封面、欢迎文字、图片说明和页尾文字。',
    design: '选择字体、字号和颜色；也可以分别调整每个栏目。手机端会自动适配。',
    sections: '调整导航顺序、栏目名称、介绍、首页显示数量；隐藏栏目不会删除内容。',
    about: '像搭积木一样组织个人介绍。支持文字、双栏、图片、链接和时间线。',
    media: '上传和选择项目中的图片。这里的图片会随网站一起发布。'
  };
  const fonts = [['sans', '简洁字体'], ['serif', '书籍衬线'], ['literary', '人文衬线'], ['mono', '等宽字体']];
  let state;
  let view = 'profile';
  let listTab = 'entries';
  let record;
  let draft;
  let dirty = false;
  let saving = false;
  let mediaCallback;
  let pollTimer;

  function node(tag, attrs = {}, ...children) {
    const element = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key.startsWith('on')) element.addEventListener(key.slice(2), value);
      else if (key === 'class') element.className = value;
      else if (key === 'value') element.value = value ?? '';
      else if (key === 'checked') element.checked = Boolean(value);
      else if (value !== undefined && value !== null) element.setAttribute(key, value);
    }
    for (const child of children.flat(Infinity)) {
      if (child === null || child === undefined || child === false) continue;
      element.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return element;
  }
  function button(text, action, className = '') { return node('button', { type: 'button', class: className, onclick: action }, text); }
  function toast(message, error = false) {
    const element = $('#toast'); element.textContent = message; element.className = error ? 'error' : ''; element.style.display = 'block';
    clearTimeout(element.timer); element.timer = setTimeout(() => { element.style.display = 'none'; }, error ? 7000 : 3500);
  }
  async function api(route, value, method = 'POST') {
    const response = await fetch('/api/' + route, { method: value === undefined ? 'GET' : method, headers: { 'Content-Type': 'application/json', 'X-Editor-Token': window.EDITOR_TOKEN }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '操作未完成，请重试。');
    return result;
  }
  function markDirty() {
    dirty = true; $('#save-state').textContent = '有未保存的修改'; $('#save-state').className = 'dirty';
  }
  function markSaved() { dirty = false; $('#save-state').textContent = '已保存到本机'; $('#save-state').className = ''; }
  function abandon() { return !dirty || window.confirm('当前修改还没有保存。确定离开这部分吗？'); }
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });

  function field(object, key, label, options = {}) {
    const type = options.type || 'text';
    const wrapper = node('label', { class: 'field' + (type === 'checkbox' ? ' check' : '') });
    let input;
    if (type === 'textarea') input = node('textarea', { rows: options.rows || 4, value: object[key] || '' });
    else if (type === 'select') {
      input = node('select');
      for (const option of options.options || []) {
        const [value, text] = Array.isArray(option) ? option : [option, option];
        input.append(node('option', { value }, text));
      }
      input.value = object[key] ?? '';
    } else input = node('input', { type, value: type === 'checkbox' ? undefined : object[key], checked: object[key], min: options.min, max: options.max, step: options.step || (type === 'number' ? '1' : undefined), placeholder: options.placeholder, required: options.required ? '' : undefined });
    input.addEventListener(type === 'select' || type === 'checkbox' ? 'change' : 'input', () => {
      object[key] = type === 'checkbox' ? input.checked : type === 'number' ? Number(input.value) : input.value;
      markDirty();
      options.change?.(object[key]);
    });
    if (type === 'checkbox') wrapper.append(input, node('span', {}, label));
    else wrapper.append(node('span', {}, label), input);
    if (options.hint) wrapper.append(node('small', {}, options.hint));
    return wrapper;
  }
  function csvField(object, key, label, hint) {
    const temporary = { text: (object[key] || []).join(', ') };
    return field(temporary, 'text', label, { hint, change: value => { object[key] = value.split(/[,，]/).map(item => item.trim()).filter(Boolean); } });
  }
  function imageSource(url) { return String(url || '').startsWith('/') ? '/media' + url : url; }
  function imageField(object, key, label, hint = '支持本地上传、图片库，或完整图片网址。') {
    const outer = node('div', { class: 'field' }, node('span', {}, label));
    const preview = node('div', { class: 'image-field-preview' });
    if (object[key]) preview.append(node('img', { src: imageSource(object[key]), alt: label }));
    else preview.append(node('span', { class: 'form-hint' }, '尚未选择图片'));
    const input = node('input', { type: 'text', value: object[key] || '', 'aria-label': label + '路径' });
    input.addEventListener('input', () => { object[key] = input.value; markDirty(); });
    input.addEventListener('change', () => { preview.replaceChildren(...(object[key] ? [node('img', { src: imageSource(object[key]), alt: label })] : [])); });
    outer.append(preview, node('div', { class: 'image-input-row' }, input, button('选择 / 上传', () => chooseMedia(url => { object[key] = url; markDirty(); render(); }))), node('small', {}, hint));
    return outer;
  }
  function card(title, ...children) { return node('section', { class: 'form-card' }, title ? node('h2', {}, title) : null, ...children); }
  function grid(...children) { return node('div', { class: 'form-grid' }, ...children); }
  function saveBar() { return node('div', { class: 'save-bar' }, node('span', {}, '先保存并预览，再发布到公开网站。'), button(saving ? '保存中…' : '保存修改', save, 'primary-button')); }
  function repeatControls(array, index, remove = true) {
    return node('div', { class: 'item-controls' }, button('↑', () => { if (index > 0) { [array[index - 1], array[index]] = [array[index], array[index - 1]]; markDirty(); render(); } }), button('↓', () => { if (index < array.length - 1) { [array[index + 1], array[index]] = [array[index], array[index + 1]]; markDirty(); render(); } }), remove ? button('移除', () => { array.splice(index, 1); markDirty(); render(); }, 'danger-button') : null);
  }
  function repeatItem(array, index, title, ...children) {
    return node('div', { class: 'repeat-item' }, node('div', { class: 'repeat-header' }, node('strong', {}, title), repeatControls(array, index)), ...children);
  }
  function addItem(array, value) { array.push(clone(value)); markDirty(); render(); }

  function navigate(next) {
    if (saving) return toast('正在保存，请稍候。');
    if (!abandon()) return;
    view = next; record = undefined; listTab = 'entries';
    draft = ['profile', 'home', 'design', 'about'].includes(view) ? clone(state[view]) : view === 'sections' ? state.sections.map(item => ({ section: item.section, title: item.meta.title, description: item.meta.description || '', kicker: item.meta.kicker || '', menu_label: item.menu_label, in_menu: item.in_menu, show_home: item.meta.show_home !== false, preview_count: item.meta.preview_count || (item.section === 'research' ? 2 : 3), more_label: item.meta.more_label || 'More' })) : null;
    markSaved(); render(); setPreview(view);
    window.scrollTo({ top: 0 });
  }
  function setPreview(section) {
    const slug = ['profile', 'home', 'design', 'sections', 'media'].includes(section) ? '' : section + '/';
    const iframe = $('#preview');
    iframe.src = 'http://localhost:1313/' + slug;
  }
  function navigation() {
    $('#settings-nav').replaceChildren(...['profile', 'home', 'design', 'sections', 'about'].map(key => button(labels[key], () => navigate(key), view === key ? 'active' : '')));
    $('#content-nav').replaceChildren(...['research', 'notes', 'thoughts', 'writings', 'gallery', 'resources', 'media'].map(key => {
      const item = button(labels[key], () => navigate(key), view === key ? 'active' : '');
      if (key !== 'media') item.append(node('span', {}, state.records.filter(record => record.section === key && record.type !== 'topic').length));
      return item;
    }));
    document.querySelector('.brand small').textContent = state.profile.display_name; document.title = '网站工作台 · ' + state.profile.display_name;
  }
  function render() {
    navigation();
    $('#breadcrumb').textContent = record ? `${labels[view]} / ${record.type === 'topic' ? '分类' : '条目'}` : labels[view];
    $('#panel-title').textContent = record ? (record.id ? '编辑' : '添加') + (record.type === 'topic' ? '分类' : record.type === 'city' ? '城市相册' : '条目') : labels[view];
    $('#panel-description').textContent = record ? '填写下面的字段即可；文件格式和网页布局由工具处理。' : descriptions[view] || (view === 'gallery' ? '按城市管理相册，每张照片都有独立的日期、地点和说明。' : '按分类管理条目；标题可直接链接到外部文档，内容不必上传为网页。');
    $('#panel-actions').replaceChildren();
    $('#editor-content').replaceChildren();
    if (record) return renderRecord();
    const renderer = { profile: renderProfile, home: renderHome, design: renderDesign, sections: renderSections, about: renderAbout, media: renderMediaPage }[view];
    if (renderer) renderer(); else renderCollection();
  }
  function renderProfile() {
    $('#editor-content').append(card('姓名与个人简介', grid(field(draft, 'display_name', '网站显示名称'), field(draft, 'full_name', '姓名')), field(draft, 'intro', '首页的一句话介绍', { type: 'textarea', rows: 2 }), field(draft, 'about_preview', '首页 About 预览文字', { type: 'textarea' }), imageField(draft, 'avatar', '头像'), field(draft, 'show_demo_notice', '显示模板示例提示', { type: 'checkbox', hint: '替换成真实内容后可关闭；关闭后网站也会允许搜索引擎收录。' })), card('学校与联系方式', grid(field(draft, 'school', '学校 / 机构'), field(draft, 'program', '项目 / 身份')), field(draft, 'email', '联系邮箱', { type: 'email', hint: '可留空。填写后，About 会显示 Email 链接。' })));
    const socials = card('外部网站');
    draft.socials ||= [];
    draft.socials.forEach((item, index) => socials.append(repeatItem(draft.socials, index, item.name || '网站链接', grid(field(item, 'name', '显示名称'), field(item, 'url', '网址')), field(item, 'icon', '图标', { type: 'select', options: [['github', 'GitHub'], ['mail', '邮件'], ['external', '通用链接']] }))));
    socials.append(button('＋ 添加网站链接', () => addItem(draft.socials, { name: '', url: '', icon: 'external' }), 'add-button'));
    $('#editor-content').append(socials, saveBar());
  }
  function renderHome() {
    $('#editor-content').append(card('欢迎区文字', field(draft, 'eyebrow', '上方小标题'), grid(field(draft, 'heading_first', '欢迎标题第一行'), field(draft, 'heading_second', '欢迎标题第二行')), field(draft, 'primary_label', 'About 入口文字'), field(draft, 'scroll_label', '向下浏览提示')), card('首页封面', imageField(draft, 'hero_image', '封面图片'), field(draft, 'hero_alt', '图片内容说明', { hint: '描述画面，方便图片无法显示或使用屏幕阅读器的访客。' }), field(draft, 'hero_caption', '图片上显示的文字'), grid(field(draft, 'hero_height', '桌面封面高度（像素）', { type: 'number', min: 160, max: 700 }), field(draft, 'hero_position', '裁切位置', { type: 'select', options: [['center', '居中'], ['top', '靠上'], ['bottom', '靠下'], ['left', '靠左'], ['right', '靠右']] }))), card('页尾文字', field(draft, 'closing_title', '结束标题'), field(draft, 'closing_text', '结束介绍'), field(draft, 'footer_text', '底部短句')), saveBar());
  }
  function renderDesign() {
    $('#editor-content').append(card('整体风格', grid(field(draft, 'accent', '浅色模式强调色', { type: 'color' }), field(draft, 'accent_dark', '深色模式强调色', { type: 'color' })), grid(field(draft, 'body_font', '默认正文字体', { type: 'select', options: fonts }), field(draft, 'heading_font', '默认标题字体', { type: 'select', options: fonts })), field(draft, 'caption_font', '图片说明字体', { type: 'select', options: fonts })));
    const sizes = card('全站字号');
    sizes.append(grid(...[['body_size', '基础文字', 12, 28], ['hero_size', '首页欢迎标题', 28, 120], ['section_size', '首页栏目标题', 22, 80], ['item_size', '条目标题', 14, 40], ['caption_size', '图片说明', 10, 24], ['nav_size', '导航文字', 11, 24], ['image_radius', '图片圆角', 0, 40]].map(([key, label, min, max]) => field(draft, key, `${label}（像素）`, { type: 'number', min, max }))));
    $('#editor-content').append(sizes);
    const scopes = card('各栏目单独设置', node('p', {}, '这里的设置只影响对应栏目。字体选“沿用全站”时使用上方默认字体。'));
    draft.scopes.forEach(scope => scopes.append(node('details', {}, node('summary', {}, labels[scope.section] || scope.section), grid(field(scope, 'title_font', '标题字体', { type: 'select', options: [['inherit', '沿用全站'], ...fonts] }), field(scope, 'title_size', '首页栏目标题字号', { type: 'number', min: 22, max: 80 })), grid(field(scope, 'page_title_size', '独立页面标题字号', { type: 'number', min: 28, max: 100 }), field(scope, 'text_font', '正文字体', { type: 'select', options: [['inherit', '沿用全站'], ...fonts] })), field(scope, 'text_size', '正文字号', { type: 'number', min: 11, max: 28 }))));
    $('#editor-content').append(scopes, saveBar());
  }
  function renderSections() {
    const container = card('', node('p', { class: 'form-hint' }, '使用 ↑ ↓ 调整顺序。隐藏不会删除已有内容。栏目类别保持不变，显示名称可以自由修改。'));
    draft.forEach((item, index) => container.append(node('div', { class: 'repeat-item' }, node('div', { class: 'repeat-header' }, node('strong', {}, labels[item.section]), repeatControls(draft, index, false)), grid(field(item, 'title', '页面标题'), field(item, 'menu_label', '导航显示名称')), field(item, 'description', '栏目介绍', { type: 'textarea', rows: 2 }), field(item, 'kicker', '栏目上方的小标题'), grid(field(item, 'in_menu', '显示在导航中', { type: 'checkbox' }), field(item, 'show_home', '在首页展示预览', { type: 'checkbox' })), grid(field(item, 'preview_count', '首页显示数量', { type: 'number', min: 1, max: 12 }), field(item, 'more_label', 'More 按钮文字')))));
    $('#editor-content').append(container, saveBar());
  }
  function renderAbout() {
    $('#editor-content').append(card('页面结构', field(draft, 'show_profile', '显示头像与个人资料', { type: 'checkbox' }), field(draft, 'layout', '资料区的位置', { type: 'select', options: [['profile-left', '左侧资料 + 右侧内容'], ['profile-right', '左侧内容 + 右侧资料'], ['profile-top', '上方资料 + 下方内容']] })));
    draft.blocks ||= [];
    const blockNames = { text: '文字块', columns: '双栏文字', image: '图片块', links: '链接列表', timeline: '时间线' };
    draft.blocks.forEach((block, index) => {
      const element = node('section', { class: 'form-card' }, node('div', { class: 'repeat-header' }, node('strong', {}, `${index + 1}. ${blockNames[block.type]}`), repeatControls(draft.blocks, index)), field(block, 'title', '块标题（可留空）'));
      if (block.type === 'text' || block.type === 'columns') element.append(field(block, 'text', block.type === 'columns' ? '左栏文字' : '文字内容', { type: 'textarea', rows: 6, hint: '直接输入文字和分段即可。也支持简单的 Markdown 格式。' }));
      if (block.type === 'columns') element.append(field(block, 'text_right', '右栏文字', { type: 'textarea', rows: 6 }));
      if (block.type === 'image') element.append(imageField(block, 'image', '图片'), field(block, 'alt', '图片内容说明'), field(block, 'caption', '图片下方的文字'));
      if (['links', 'timeline'].includes(block.type)) {
        block.items ||= [];
        block.items.forEach((item, i) => element.append(repeatItem(block.items, i, item.title || '新项目', field(item, 'title', '标题'), field(item, block.type === 'links' ? 'url' : 'date', block.type === 'links' ? '网址' : '时间'), field(item, 'text', '说明', { type: 'textarea', rows: 2 }))));
        element.append(button('＋ 添加项目', () => addItem(block.items, { title: '', text: '', ...(block.type === 'links' ? { url: '' } : { date: '' }) }), 'add-button'));
      }
      $('#editor-content').append(element);
    });
    $('#editor-content').append(card('添加内容块', node('div', { class: 'block-choice' }, ...Object.entries(blockNames).map(([type, label]) => button('＋ ' + label, () => addItem(draft.blocks, { type, title: '', text: '', text_right: '', image: '', alt: '', caption: '', items: [] }), 'add-button')))), saveBar());
  }
  function editRecord(item) {
    if (!abandon()) return;
    record = clone(item); draft = record; markSaved(); render();
    setPreview(record.section);
    window.scrollTo({ top: 0 });
  }
  function newRecord(type) {
    const date = new Date().toLocaleDateString('en-CA');
    const topic = state.records.find(item => item.section === view && item.type === 'topic')?.topic || '';
    editRecord({ id: '', section: view, type, topic, meta: { title: '', description: '', weight: 10, ...(type === 'entry' ? { authors: [state.profile.full_name], date, lastmod: date, link: '', link_label: view === 'research' ? 'View manuscript' : 'Open document', tags: [], series: [], status: view === 'research' ? 'In progress' : '' } : type === 'city' ? { country: '', cover: '', cover_alt: '', photos: [] } : {}) }, body: '' });
  }
  function renderCollection() {
    $('#panel-actions').append(button(view === 'gallery' ? '＋ 添加城市' : listTab === 'topics' ? '＋ 添加分类' : '＋ 添加条目', () => newRecord(view === 'gallery' ? 'city' : listTab === 'topics' ? 'topic' : 'entry'), 'primary-button'));
    const content = $('#editor-content');
    if (view !== 'gallery') content.append(node('div', { class: 'content-tabs' }, button('条目', () => { listTab = 'entries'; render(); }, listTab === 'entries' ? 'active' : ''), button('分类 / 主题', () => { listTab = 'topics'; render(); }, listTab === 'topics' ? 'active' : '')));
    const search = node('input', { type: 'search', placeholder: '搜索标题或介绍…', 'aria-label': '搜索当前栏目' });
    const topicSelect = node('select', { 'aria-label': '筛选分类' }, node('option', { value: '' }, '所有分类'));
    state.records.filter(item => item.section === view && item.type === 'topic').forEach(item => topicSelect.append(node('option', { value: item.topic }, item.meta.title)));
    content.append(node('div', { class: 'list-toolbar' }, search, view === 'gallery' || listTab === 'topics' ? null : topicSelect));
    const list = node('div', { class: 'record-list' }); content.append(list);
    function rows() {
      const items = state.records.filter(item => item.section === view && (view === 'gallery' ? item.type === 'city' : listTab === 'topics' ? item.type === 'topic' : item.type === 'entry')).filter(item => !topicSelect.value || item.topic === topicSelect.value || listTab === 'topics').filter(item => (item.meta.title + ' ' + item.meta.description).toLowerCase().includes(search.value.toLowerCase()));
      list.replaceChildren(...items.map(item => node('article', { class: 'record-card' }, node('div', {}, item.topic && item.type !== 'topic' ? node('span', { class: 'pill' }, state.records.find(topic => topic.section === view && topic.type === 'topic' && topic.topic === item.topic)?.meta.title || item.topic) : null, node('h3', {}, item.meta.title), node('p', {}, String(item.meta.description || '').slice(0, 150)), node('p', {}, [item.meta.draft ? '草稿（暂不发布）' : '', item.meta.status || '', item.meta.date || '', item.type === 'city' ? `${(item.meta.photos || []).length} 张图片` : ''].filter(Boolean).join(' · '))), button('编辑', () => editRecord(item)))));
      if (!items.length) list.append(node('div', { class: 'empty-state' }, '这里还没有内容。点击右上角添加。'));
    }
    search.addEventListener('input', rows); topicSelect.addEventListener('change', rows); rows();
  }
  function renderRecord() {
    const meta = draft.meta;
    $('#editor-content').append(button('← 返回' + labels[view], () => navigate(view), 'back-button'));
    const common = card('基本信息', field(meta, 'title', '标题'), field(meta, 'description', '介绍 / 摘要', { type: 'textarea', rows: 4 }), grid(field(meta, 'weight', '显示顺序（越小越靠前）', { type: 'number', min: -10000, max: 10000 }), field(meta, 'draft', '暂存为草稿（不公开）', { type: 'checkbox' })));
    if (record.type === 'entry') {
      const topics = state.records.filter(item => item.section === view && item.type === 'topic').map(item => [item.topic, item.meta.title]);
      common.prepend(field(draft, 'topic', '所属分类', { type: 'select', options: [['', '请选择分类'], ...topics], hint: '如需新分类，先返回列表，在“分类 / 主题”中添加。' }));
      common.append(csvField(meta, 'authors', '作者 / 合作者', '多人之间用逗号分隔。'), grid(field(meta, 'date', '发布日期', { type: 'date' }), field(meta, 'lastmod', '更新日期', { type: 'date' })));
      $('#editor-content').append(common, card('文档与配图', view === 'research' ? field(meta, 'status', '研究状态', { type: 'select', options: [['In progress', '进行中'], ['Working paper', '工作论文'], ['Under review', '审稿中'], ['Published', '已发表']] }) : null, field(meta, 'link', '完整文档的网址', { hint: '可使用 Dropbox、Google Drive 或其他网站的公开分享链接。研究进行中可以留空。' }), field(meta, 'link_label', '链接按钮文字'), imageField(meta, 'image', '条目图片（可选）'), field(meta, 'image_alt', '图片内容说明')));
      const attachments = card('更多链接（可选）'); meta.attachments ||= [];
      meta.attachments.forEach((item, index) => attachments.append(repeatItem(meta.attachments, index, item.label || '附加链接', field(item, 'label', '链接名称'), field(item, 'url', '网址'))));
      attachments.append(button('＋ 添加链接', () => addItem(meta.attachments, { label: '', url: '' }), 'add-button'));
      $('#editor-content').append(attachments, card('整理方式', csvField(meta, 'tags', '标签', '用逗号分隔，例如 Cities, Methods。'), csvField(meta, 'series', '所属系列（可选）', '把相关条目归入同一个系列。'), field(draft, 'body', '条目详情的补充说明（可选）', { type: 'textarea', rows: 4 })));
    } else if (record.type === 'topic') $('#editor-content').append(common);
    else {
      common.append(field(meta, 'country', '国家 / 地区'), imageField(meta, 'cover', '城市封面'), field(meta, 'cover_alt', '封面图片内容说明'), field(draft, 'body', '城市相册介绍', { type: 'textarea' }));
      $('#editor-content').append(common);
      meta.photos ||= [];
      meta.photos.forEach((photo, index) => $('#editor-content').append(node('section', { class: 'form-card' }, node('div', { class: 'repeat-header' }, node('strong', {}, `照片 ${index + 1}`), repeatControls(meta.photos, index)), imageField(photo, 'src', '照片'), field(photo, 'title', '照片标题'), grid(field(photo, 'date', '时间', { hint: '可填 2026-10-19，或“2026 年秋”。' }), field(photo, 'location', '地点')), field(photo, 'caption', '照片下方的说明', { type: 'textarea', rows: 3 }), field(photo, 'alt', '画面内容说明', { hint: '请简短描述画面；这是图片无法显示时的替代文字。' }))));
      $('#editor-content').append(node('div', { class: 'actions-row' }, button('＋ 添加照片', () => addItem(meta.photos, { src: '', title: '', date: '', location: '', caption: '', alt: '' }), 'add-button')));
    }
    if (record.id) $('#editor-content').append(node('div', { class: 'actions-row' }, button('移到本机回收备份', removeCurrent, 'danger-button')));
    $('#editor-content').append(saveBar());
  }
  async function save() {
    if (saving) return;
    saving = true;
    document.querySelectorAll('#editor-content input, #editor-content textarea, #editor-content select, #editor-content button, #settings-nav button, #content-nav button, .toolbar button').forEach(control => { control.disabled = true; });
    try {
      if (record) {
        const response = await api('record', { record: draft, revision: state.revision });
        state = response.state; record = clone(state.records.find(item => item.id === response.id)); draft = record;
      } else state = await api('settings', { key: view, value: draft, revision: state.revision }, 'PUT');
      markSaved(); toast('已保存。预览正在更新。');
      $('#preview').src = $('#preview').src;
    } catch (error) { toast(error.message, true); }
    finally { saving = false; document.querySelectorAll('.toolbar button').forEach(control => { control.disabled = false; }); render(); }
  }
  async function removeCurrent() {
    if (!window.confirm('将这个项目移到本机备份？发布后它会从公开网站移除。分类有条目时不能删除。')) return;
    try { state = await api('remove', { id: record.id, revision: state.revision }); dirty = false; navigate(view); toast('已移到本机备份。'); }
    catch (error) { toast(error.message, true); }
  }
  function chooseMedia(callback) { mediaCallback = callback; renderMediaGrid(); $('#media-dialog').showModal(); }
  function renderMediaGrid() {
    $('#media-grid').replaceChildren(...state.media.map(item => button('', () => { mediaCallback(item.url); $('#media-dialog').close(); })).map((element, index) => { const item = state.media[index]; element.append(node('img', { src: imageSource(item.url), alt: item.name, loading: 'lazy' }), node('span', {}, item.name)); return element; }));
  }
  async function upload(file) {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) return toast('图片请控制在 15 MB 以内。', true);
    try {
      const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); });
      const response = await api('upload', { name: file.name, data });
      state.media = response.media; toast('图片已上传。');
      if ($('#media-dialog').open) { mediaCallback(response.url); $('#media-dialog').close(); }
      else render();
    } catch (error) { toast(error.message, true); }
  }
  function renderMediaPage() {
    const input = node('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif,image/avif', hidden: '' });
    input.addEventListener('change', () => upload(input.files[0]));
    $('#panel-actions').append(input, button('＋ 上传图片', () => input.click(), 'primary-button'));
    $('#editor-content').append(node('div', { class: 'media-page' }, ...state.media.map(item => node('figure', {}, node('img', { src: imageSource(item.url), alt: item.name, loading: 'lazy' }), node('figcaption', {}, item.name, node('br'), `${Math.round(item.size / 1024)} KB`, node('br'), button('复制图片路径', async () => { try { await navigator.clipboard.writeText(item.url); toast('图片路径已复制。'); } catch { toast('图片路径：' + item.url); } }))))));
  }
  $('#media-upload').addEventListener('change', event => { upload(event.target.files[0]); event.target.value = ''; });
  $('#close-media').addEventListener('click', () => $('#media-dialog').close());
  $('#reload-preview').addEventListener('click', () => { $('#preview').src = $('#preview').src; });
  $('#refresh').addEventListener('click', async () => { if (!abandon()) return; try { state = await api('state'); dirty = false; navigate(view); toast('已重新读取项目内容。'); } catch (error) { toast(error.message, true); } });
  $('#close-publish').addEventListener('click', () => $('#publish-dialog').close());
  async function pollPublish() {
    try {
      const job = await api('publish');
      $('#publish-output').textContent = job.output || '正在开始…';
      $('#publish-output').scrollTop = $('#publish-output').scrollHeight;
      $('#publish-status').textContent = job.running ? '正在构建、检查并上传…' : job.exitCode === 0 ? '已上传。GitHub Pages 正在部署，请查看部署状态。' : '发布未完成。上方信息会说明原因；本机内容仍已保存。';
      $('#publish').disabled = job.running;
      if (job.running) pollTimer = setTimeout(pollPublish, 1500);
    } catch (error) { $('#publish-status').textContent = error.message; $('#publish').disabled = false; }
  }
  $('#publish').addEventListener('click', async () => {
    if (dirty) return toast('请先保存当前修改，再发布。', true);
    try { await api('publish', {}); $('#publish-dialog').showModal(); clearTimeout(pollTimer); pollPublish(); }
    catch (error) { toast(error.message, true); }
  });
  async function initialize() {
    try { state = await api('state'); navigate('profile'); }
    catch (error) { $('#panel-title').textContent = '无法读取项目'; $('#panel-description').textContent = error.message; }
  }
  initialize();
})();
