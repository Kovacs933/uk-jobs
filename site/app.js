// UK job postings: one row per job title, most postings first, with a search box, a date range,
// sortable columns and the employers behind each title.
(function () {
  const PAGE_SIZE = 200;
  const SHARDS = 64;

  // copies of titleKey and shardOf in scraper/lib/normalise.js: keep them in step
  const titleKey = (title) => title.toLowerCase().replace(/[^a-z0-9+#]+/g, ' ').trim();
  function shardOf(key) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < key.length; i++) {
      hash ^= key.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash % SHARDS;
  }

  const els = {
    summary: document.getElementById('summary'),
    search: document.getElementById('search'),
    range: document.getElementById('range'),
    resultCount: document.getElementById('resultCount'),
    rows: document.getElementById('rows'),
    empty: document.getElementById('empty'),
    more: document.getElementById('more'),
    sites: document.getElementById('sites'),
    sortButtons: document.querySelectorAll('th button[data-sort]'),
  };

  const state = { meta: null, range: '30', titles: [], filtered: [], shown: 0, sort: { by: 'count', dir: 'desc' } };
  const cache = new Map();
  const numberFormat = new Intl.NumberFormat('en-GB');
  const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  function getJson(file) {
    if (!cache.has(file)) {
      cache.set(
        file,
        fetch(window.DATA_BASE + file, { cache: 'no-cache' }).then((res) => {
          if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
          return res.json();
        }),
      );
    }
    return cache.get(file);
  }

  const formatDay = (day) => dateFormat.format(new Date(`${day}T12:00:00Z`));

  function renderSummary() {
    const range = state.meta.ranges.find((r) => r.id === state.range);
    const updated = new Date(state.meta.updated);
    const span = range.id === 'all' ? 'everything collected' : `${formatDay(range.from)} – ${formatDay(range.to)}`;
    els.summary.textContent =
      `${numberFormat.format(range.postings)} postings across ${numberFormat.format(range.titles)} job titles, ${span}. ` +
      `Updated ${updated.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}.`;
  }

  function renderSites() {
    els.sites.replaceChildren(
      ...Object.values(state.meta.sites).map((site) => {
        const li = document.createElement('li');
        const when = site.lastRun ? new Date(site.lastRun).toLocaleDateString('en-GB') : 'never';
        li.textContent =
          site.status === 'ok'
            ? `${site.name}: ${numberFormat.format(site.found)} jobs read, ${numberFormat.format(site.new)} new (${when})`
            : `${site.name}: last crawl failed (${when})`;
        if (site.status !== 'ok') li.className = 'status-error';
        return li;
      }),
    );
  }

  function applyFilterAndSort() {
    const words = els.search.value.toLowerCase().split(/\s+/).filter(Boolean);
    const list = words.length
      ? state.titles.filter(([title]) => {
          const lower = title.toLowerCase();
          return words.every((w) => lower.includes(w));
        })
      : state.titles.slice();
    const { by, dir } = state.sort;
    const sign = dir === 'asc' ? 1 : -1;
    list.sort((a, b) =>
      by === 'count' ? sign * (a[1] - b[1]) || a[0].localeCompare(b[0]) : sign * a[0].localeCompare(b[0], 'en-GB'),
    );
    state.filtered = list;
    state.shown = 0;
    els.rows.replaceChildren();
    showMore();

    const total = list.reduce((sum, [, count]) => sum + count, 0);
    els.resultCount.textContent = words.length
      ? `${numberFormat.format(list.length)} job titles match, with ${numberFormat.format(total)} postings.`
      : '';
    els.empty.hidden = list.length > 0;
    els.sortButtons.forEach((button) => {
      button.parentElement.setAttribute('aria-sort', button.dataset.sort === by ? (dir === 'asc' ? 'ascending' : 'descending') : 'none');
    });
  }

  function showMore() {
    const max = state.filtered.reduce((m, [, count]) => Math.max(m, count), 1);
    const fragment = document.createDocumentFragment();
    const next = state.filtered.slice(state.shown, state.shown + PAGE_SIZE);
    next.forEach(([title, count], i) => {
      const tr = document.createElement('tr');
      tr.className = 'title-row';
      const rank = document.createElement('td');
      rank.className = 'rank';
      rank.textContent = state.shown + i + 1;
      const cell = document.createElement('td');
      cell.className = 'title-cell';
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = title;
      button.setAttribute('aria-expanded', 'false');
      const bar = document.createElement('div');
      bar.className = 'bar';
      bar.style.width = `${Math.max(1, (count / max) * 100)}%`;
      cell.append(button, bar);
      const num = document.createElement('td');
      num.className = 'num';
      num.textContent = numberFormat.format(count);
      tr.append(rank, cell, num);
      tr.addEventListener('click', () => toggleEmployers(tr, button, title));
      fragment.append(tr);
    });
    els.rows.append(fragment);
    state.shown += next.length;
    const left = state.filtered.length - state.shown;
    els.more.hidden = left <= 0;
    els.more.textContent = `Show ${numberFormat.format(Math.min(PAGE_SIZE, left))} more of ${numberFormat.format(left)}`;
  }

  async function toggleEmployers(tr, button, title) {
    const open = tr.nextElementSibling?.classList.contains('employers');
    if (open) {
      tr.nextElementSibling.remove();
      button.setAttribute('aria-expanded', 'false');
      return;
    }
    button.setAttribute('aria-expanded', 'true');
    const row = document.createElement('tr');
    row.className = 'employers';
    const td = document.createElement('td');
    td.colSpan = 3;
    td.textContent = 'Loading employers…';
    row.append(td);
    tr.after(row);

    const key = titleKey(title);
    try {
      const shard = await getJson(`employers-${state.range}-${shardOf(key)}.json`);
      const employers = shard[key] ?? [];
      const heading = document.createElement('p');
      heading.className = 'employers-heading';
      heading.textContent = `Employers advertising “${title}”`;
      const ul = document.createElement('ul');
      ul.className = 'employer-list';
      for (const [name, count] of employers) {
        const li = document.createElement('li');
        const label = document.createElement('span');
        label.textContent = name;
        const n = document.createElement('span');
        n.className = 'count';
        n.textContent = numberFormat.format(count);
        li.append(label, n);
        ul.append(li);
      }
      td.replaceChildren(heading, ul);
    } catch (error) {
      td.textContent = `Couldn't load the employers (${error.message}).`;
    }
  }

  async function loadRange(id) {
    state.range = id;
    els.summary.textContent = 'Loading…';
    state.titles = await getJson(`titles-${id}.json`);
    renderSummary();
    applyFilterAndSort();
  }

  let searchTimer;
  els.search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(applyFilterAndSort, 150);
  });
  els.range.addEventListener('change', () => loadRange(els.range.value));
  els.more.addEventListener('click', showMore);
  els.sortButtons.forEach((button) =>
    button.addEventListener('click', () => {
      const by = button.dataset.sort;
      state.sort =
        state.sort.by === by
          ? { by, dir: state.sort.dir === 'asc' ? 'desc' : 'asc' }
          : { by, dir: by === 'count' ? 'desc' : 'asc' };
      applyFilterAndSort();
    }),
  );

  getJson('meta.json')
    .then((meta) => {
      state.meta = meta;
      els.range.replaceChildren(
        ...meta.ranges.map((r) => {
          const option = document.createElement('option');
          option.value = r.id;
          option.textContent = r.label;
          option.selected = r.id === state.range;
          return option;
        }),
      );
      renderSites();
      return loadRange(state.range);
    })
    .catch((error) => {
      els.summary.textContent = `Couldn't load the job data (${error.message}). It appears after the first daily run.`;
    });
})();
