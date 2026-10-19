import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createModel, parseContent, safeUrl } from './editor-model.mjs';

const project = path.resolve(import.meta.dirname, '..');
function fixture() {
  const parent = path.join(project, '.tools', 'editor-tests');
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'case-'));
  for (const directory of ['content', 'data']) fs.cpSync(path.join(project, directory), path.join(root, directory), { recursive: true });
  fs.mkdirSync(path.join(root, 'static', 'images'), { recursive: true });
  fs.copyFileSync(path.join(project, 'hugo.toml'), path.join(root, 'hugo.toml'));
  return createModel(root);
}
test('Unicode content, collaborators, and stable paths survive a form edit', () => {
  const model = fixture();
  const old = model.state().records.find(record => record.type === 'entry');
  const updated = { ...old, meta: { ...old.meta, title: '中文标题与 café 📚', description: '时间、地点、研究简介不变成问号。', authors: ['Zixuan Bao', '王同学'] } };
  const result = model.saveRecord(updated, model.revision());
  const saved = parseContent(fs.readFileSync(path.join(model.root, 'content', result.id), 'utf8'));
  assert.equal(result.id, old.id);
  assert.equal(saved.meta.title, updated.meta.title);
  assert.deepEqual(saved.meta.authors, updated.meta.authors);
  assert.equal(saved.meta.description, updated.meta.description);
});
test('An outdated editor cannot overwrite a newer edit', () => {
  const model = fixture();
  const before = model.revision();
  const home = model.state().home;
  model.saveSettings('home', { ...home, hero_caption: 'Newer caption' }, before);
  assert.throws(() => model.saveSettings('home', home, before), error => error.status === 409);
  assert.equal(model.state().home.hero_caption, 'Newer caption');
});
test('Create a category, add an entry, move it, and safely remove the empty category', () => {
  const model = fixture();
  let result = model.saveRecord({ type: 'topic', section: 'notes', meta: { title: 'A new subject', description: '', weight: 1 } }, model.revision());
  const topic = result.state.records.find(item => item.id === result.id);
  result = model.saveRecord({ type: 'entry', section: 'notes', topic: topic.topic, meta: { title: 'Example new note', description: 'New description', date: '2026-10-19', lastmod: '2026-10-19', link: 'https://example.com/note', weight: 1 } }, model.revision());
  const added = result.state.records.find(item => item.id === result.id);
  assert.throws(() => model.removeRecord(topic.id, model.revision()), /还有条目/);
  const target = result.state.records.find(item => item.type === 'topic' && item.section === 'notes' && item.topic !== topic.topic);
  const moved = model.saveRecord({ ...added, topic: target.topic }, model.revision());
  assert(moved.id.startsWith('notes/' + target.topic));
  assert(!fs.existsSync(path.join(model.root, 'content', added.id)));
  model.removeRecord(topic.id, model.revision());
  assert(!model.state().records.some(item => item.id === topic.id));
  assert(fs.existsSync(path.join(model.root, '.tools', 'editor-trash')));
});
test('Invalid destinations, paths, dates, CSS values, and uploads are rejected', () => {
  assert.throws(() => safeUrl('javascript:alert(1)'));
  assert.throws(() => safeUrl('/images/../private'));
  const model = fixture();
  const old = model.state().records.find(item => item.type === 'entry');
  assert.throws(() => model.saveRecord({ ...old, id: '../outside.md' }, model.revision()));
  assert.throws(() => model.saveRecord({ ...old, meta: { ...old.meta, date: '2026-02-31' } }, model.revision()));
  const design = model.state().design;
  assert.throws(() => model.saveSettings('design', { ...design, body_size: '18; color:red' }, model.revision()));
  assert.throws(() => model.upload({ name: 'bad.png', data: Buffer.from('<script>bad</script>').toString('base64') }));
});
test('Profile and appearance changes persist without changing content titles', () => {
  const model = fixture();
  const profile = model.state().profile;
  model.saveSettings('profile', { ...profile, display_name: 'Zixuan Bao', full_name: 'Zixuan Bao' }, model.revision());
  const about = model.state().about;
  model.saveSettings('about', { ...about, layout: 'profile-top', blocks: [{ type: 'columns', title: 'Education', text: '左栏', text_right: 'Right column' }] }, model.revision());
  assert.equal(model.state().about.layout, 'profile-top');
  assert.equal(model.state().about.blocks[0].text, '左栏');
  const design = model.state().design;
  model.saveSettings('design', { ...design, caption_size: 14 }, model.revision());
  assert.equal(model.state().design.caption_size, 14);
});
