import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import TOML from '@iarna/toml';

const root = path.resolve(import.meta.dirname, '..', 'public');
const config = TOML.parse(fs.readFileSync(path.resolve(root, '..', 'hugo.toml'), 'utf8'));
const siteURL = new URL(config.baseURL);
assert(fs.existsSync(root), 'Build the site before running checks.');
const files = [];
function collect(folder) {
  for (const name of fs.readdirSync(folder)) {
    const full = path.join(folder, name);
    if (fs.statSync(full).isDirectory()) collect(full);
    else files.push(full);
  }
}
collect(root);
const htmlFiles = files.filter(file => file.endsWith('.html'));
const errors = [];
const entities = text => text.replaceAll('&amp;', '&').replaceAll('&#39;', "'").replaceAll('&quot;', '"').replaceAll('&#x2f;', '/');
const attributes = tag => {
  const result = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) result[match[1]] = entities(match[2] ?? match[3] ?? match[4]);
  return result;
};
function targetFile(url) {
  const relative = decodeURIComponent(url.pathname).replace(/^\//, '');
  const direct = path.join(root, relative);
  if (fs.existsSync(direct) && fs.statSync(direct).isFile()) return direct;
  const index = path.join(direct, 'index.html');
  return fs.existsSync(index) ? index : null;
}
let checkedLinks = 0;
let checkedImages = 0;
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const relative = path.relative(root, file).split(path.sep).join('/');
  const pageURL = new URL(relative === 'index.html' ? '/' : `/${relative.replace(/index\.html$/, '')}`, siteURL);
  const ids = [...html.matchAll(/\bid\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(match => match[1] ?? match[2] ?? match[3]);
  if (new Set(ids).size !== ids.length) errors.push(`${relative}: duplicate element IDs`);
  if ((html.match(/<h1(?:\s|>)/g) || []).length !== 1) errors.push(`${relative}: expected one main heading`);
  for (const tag of html.match(/<(?:a|img|script|link|form|button)\b[^>]*>/g) || []) {
    const attr = attributes(tag);
    if (tag.startsWith('<img')) {
      checkedImages++;
      if (!('alt' in attr) && !/\balt(?:\s|>)/.test(tag)) errors.push(`${relative}: image is missing alternative text`);
    }
    const href = attr.src ?? attr.href ?? attr.action ?? attr['data-photo-src'];
    if (!href || /^(mailto:|tel:|data:|javascript:)/.test(href)) continue;
    const url = new URL(href, pageURL);
    if (![siteURL.hostname, 'localhost', '127.0.0.1'].includes(url.hostname)) continue;
    checkedLinks++;
    const destination = targetFile(url);
    if (!destination) { errors.push(`${relative}: missing destination ${href}`); continue; }
    if (url.hash && destination.endsWith('.html')) {
      const target = fs.readFileSync(destination, 'utf8');
      const fragment = decodeURIComponent(url.hash.slice(1));
      const found = [...target.matchAll(/\bid\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].some(match => (match[1] ?? match[2] ?? match[3]) === fragment);
      if (!found) errors.push(`${relative}: missing anchor ${href}`);
    }
    if (attr.target === '_blank' && !(attr.rel || '').includes('noopener')) errors.push(`${relative}: external tab needs noopener`);
  }
}
const homepage = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const nav = homepage.match(/<nav[^>]*id=(?:"main-navigation"|main-navigation)[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? '';
const labels = [...nav.matchAll(/<a\b[^>]*>([^<]+)<\/a>/g)].map(match => match[1]);
assert.deepEqual(labels, [...config.menus.main].sort((a,b) => a.weight - b.weight).map(menu => menu.name), 'Navigation does not match the saved settings.');
const searchIndex = JSON.parse(fs.readFileSync(path.join(root, 'search.json'), 'utf8'));
assert(new Set(searchIndex.map(page => page.url)).size === searchIndex.length, 'Search contains duplicate URLs.');
for (const page of searchIndex) assert(targetFile(new URL(page.url, siteURL)), `Missing search destination ${page.url}`);
assert(homepage.includes('prefers-color-scheme') || fs.readFileSync(files.find(file => /site\.min.*\.css$/.test(file)) ?? files.find(file => /site\..*\.css$/.test(file)), 'utf8').includes('prefers-color-scheme'), 'System color preference is missing.');
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`Passed: ${htmlFiles.length} HTML pages, ${checkedLinks} internal references, ${checkedImages} image tags, ${searchIndex.length} searchable pages, navigation order, and fragment targets.`);
