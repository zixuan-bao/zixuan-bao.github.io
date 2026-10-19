(() => {
  'use strict';
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const syncTheme = () => document.documentElement.setAttribute('data-bs-theme', media.matches ? 'dark' : 'light');
  syncTheme();
  media.addEventListener('change', syncTheme);

  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.main-nav');
  toggle?.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.setAttribute('aria-label', expanded ? 'Close navigation' : 'Open navigation');
    nav.classList.toggle('is-open', expanded);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && nav?.classList.contains('is-open')) {
      toggle.click(); toggle.focus();
    }
  });

  // Filters retain real anchors, so topics remain navigable without JavaScript.
  const filters = [...document.querySelectorAll('[data-filter]')];
  const groups = [...document.querySelectorAll('[data-topic-group]')];
  function selectTopic(filter) {
    filters.forEach(link => {
      const selected = link === filter;
      link.classList.toggle('selected', selected);
      if (selected) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
    groups.forEach(group => { group.hidden = filter.dataset.filter !== 'all' && group.dataset.topicGroup !== filter.dataset.filter; });
  }
  filters.forEach(filter => filter.addEventListener('click', event => {
    event.preventDefault();
    selectTopic(filter);
    history.replaceState(null, '', filter.getAttribute('href'));
  }));
  if (filters.length && location.hash) {
    const initial = filters.find(filter => filter.getAttribute('href') === location.hash);
    if (initial) selectTopic(initial);
  }

  const form = document.querySelector('.search-form');
  if (form) {
    const input = form.querySelector('input');
    const status = document.querySelector('.search-status');
    const results = document.querySelector('.search-results');
    let indexPromise;
    let revision = 0;
    let timer;
    const normalize = text => String(text ?? '').normalize('NFKC').toLocaleLowerCase();
    async function search() {
      const currentRevision = ++revision;
      const query = input.value.trim();
      results.replaceChildren();
      if (!query) { status.textContent = 'Type a word or phrase to explore the collection.'; return; }
      status.textContent = 'Searching…';
      try {
        if (!indexPromise) indexPromise = fetch(form.dataset.index).then(response => {
          if (!response.ok) throw new Error('Search index unavailable');
          return response.json();
        }).catch(error => { indexPromise = undefined; throw error; });
        const index = await indexPromise;
        if (currentRevision !== revision) return;
        const words = normalize(query).split(/\s+/).filter(Boolean);
        const matches = index.map(page => {
          const title = normalize(page.title);
          const haystack = normalize([page.title, page.description, page.section, page.topic, ...(page.authors || []), ...(page.tags || [])].join(' '));
          return { page, score: words.every(word => haystack.includes(word)) ? words.reduce((score, word) => score + (title.includes(word) ? 3 : 1), 0) : 0 };
        }).filter(result => result.score > 0).sort((a, b) => b.score - a.score || a.page.title.localeCompare(b.page.title));
        status.textContent = matches.length ? `${matches.length} result${matches.length === 1 ? '' : 's'} for “${query}”` : `No results for “${query}”. Try a different word, or browse the archive.`;
        for (const { page } of matches) {
          const article = document.createElement('article'); article.className = 'search-result';
          const topic = document.createElement('span'); topic.textContent = [page.section, page.topic].filter((item, i, array) => item && array.indexOf(item) === i).join(' / ');
          const heading = document.createElement('h2'); const link = document.createElement('a'); link.href = page.url; link.textContent = page.title; heading.append(link);
          const description = document.createElement('p'); description.textContent = page.description;
          article.append(topic, heading, description); results.append(article);
        }
      } catch {
        if (currentRevision === revision) status.textContent = 'Search is temporarily unavailable. Please try again or browse the archive.';
      }
    }
    form.addEventListener('submit', event => {
      event.preventDefault(); clearTimeout(timer);
      const url = new URL(location.href);
      input.value.trim() ? url.searchParams.set('q', input.value.trim()) : url.searchParams.delete('q');
      history.replaceState(null, '', url); search();
    });
    input.addEventListener('input', () => {
      revision++; clearTimeout(timer); timer = setTimeout(search, 160);
    });
    const initial = new URLSearchParams(location.search).get('q');
    if (initial) { input.value = initial; search(); }
  }

  const dialog = document.querySelector('.lightbox');
  const photos = [...document.querySelectorAll('[data-photo-src]')];
  if (dialog && photos.length) {
    const image = dialog.querySelector('img');
    const caption = dialog.querySelector('#photo-caption');
    const position = dialog.querySelector('#photo-position');
    let active = 0;
    let opener;
    const show = index => {
      active = (index + photos.length) % photos.length;
      image.src = photos[active].dataset.photoSrc;
      image.alt = photos[active].querySelector('img').alt;
      caption.textContent = photos[active].dataset.photoCaption;
      position.textContent = `${active + 1} / ${photos.length}`;
    };
    photos.forEach((photo, index) => photo.addEventListener('click', () => {
      opener = photo; show(index); dialog.showModal(); document.body.style.overflow = 'hidden';
    }));
    dialog.querySelector('[data-lightbox-close]').addEventListener('click', () => dialog.close());
    dialog.querySelector('[data-photo-prev]').addEventListener('click', () => show(active - 1));
    dialog.querySelector('[data-photo-next]').addEventListener('click', () => show(active + 1));
    dialog.addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); show(active - 1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); show(active + 1); }
    });
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => { document.body.style.overflow = ''; opener?.focus(); });
    if (photos.length < 2) dialog.querySelectorAll('[data-photo-prev], [data-photo-next]').forEach(button => { button.hidden = true; });
  }
})();
