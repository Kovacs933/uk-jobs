// Turns data/postings into the small files the website reads (site-data/):
//   meta.json                  when it was updated, totals per date range, how each site's crawl went
//   titles-<range>.json        [[job title, postings], ...], most postings first
//   employers-<range>-<n>.json { titleKey: [[employer, postings], ...] }, split into SHARDS files
//
// The same advert is often on more than one site. Postings with the same title, employer and
// posted date are counted once per site, and a group counts as many as the site with the most.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SHARDS, employerKey, shardOf, titleKey } from './lib/normalise.js';
import { addDays, isoDay, loadStatus, postingFiles, readPostings } from './store.js';

const OUT_DIR = 'site-data';
const RANGES = [
  { id: '7', label: 'Last 7 days', days: 7 },
  { id: '30', label: 'Last 30 days', days: 30 },
  { id: '90', label: 'Last 90 days', days: 90 },
  { id: 'all', label: 'Everything collected', days: Infinity },
];
const MAX_EMPLOYERS_PER_TITLE = 300;

const today = isoDay(new Date());

/** The most common spelling seen for a key, used for display. */
function bestName(spellings) {
  let best = '';
  let bestCount = -1;
  for (const [name, count] of spellings) {
    if (count > bestCount) [best, bestCount] = [name, count];
  }
  return best;
}

const bump = (map, key, by = 1) => map.set(key, (map.get(key) ?? 0) + by);

function buildRange(postings, range) {
  const from = range.days === Infinity ? '0000-00-00' : addDays(today, 1 - range.days);
  // "title|employer|day" -> site -> postings
  const groups = new Map();
  const titleSpellings = new Map();
  const employerSpellings = new Map();

  for (const p of postings) {
    if (p.d < from || p.d > today) continue;
    const tk = titleKey(p.t);
    const ek = employerKey(p.e);
    if (!tk) continue;
    const group = `${tk}|${ek}|${p.d}`;
    if (!groups.has(group)) groups.set(group, new Map());
    bump(groups.get(group), p.s);
    if (!titleSpellings.has(tk)) titleSpellings.set(tk, new Map());
    bump(titleSpellings.get(tk), p.t);
    if (!employerSpellings.has(ek)) employerSpellings.set(ek, new Map());
    bump(employerSpellings.get(ek), p.e);
  }

  const titleCounts = new Map();
  const employersByTitle = new Map();
  let total = 0;
  for (const [group, perSite] of groups) {
    const count = Math.max(...perSite.values());
    const [tk, ek] = group.split('|');
    total += count;
    bump(titleCounts, tk, count);
    if (!employersByTitle.has(tk)) employersByTitle.set(tk, new Map());
    bump(employersByTitle.get(tk), ek, count);
  }

  const titles = [...titleCounts]
    .map(([tk, count]) => [bestName(titleSpellings.get(tk)), count])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  const shards = Array.from({ length: SHARDS }, () => ({}));
  for (const [tk, employers] of employersByTitle) {
    const sorted = [...employers].sort((a, b) => b[1] - a[1]);
    const list = sorted.slice(0, MAX_EMPLOYERS_PER_TITLE).map(([ek, count]) => [bestName(employerSpellings.get(ek)), count]);
    if (sorted.length > MAX_EMPLOYERS_PER_TITLE) {
      const rest = sorted.slice(MAX_EMPLOYERS_PER_TITLE);
      list.push([`${rest.length} other employers`, rest.reduce((sum, [, c]) => sum + c, 0)]);
    }
    shards[shardOf(tk)][tk] = list;
  }

  return { from, total, titles, shards };
}

const postings = postingFiles().flatMap((file) => readPostings(file.path));

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

const meta = { updated: new Date().toISOString(), today, ranges: [], sites: loadStatus() };
for (const range of RANGES) {
  const { from, total, titles, shards } = buildRange(postings, range);
  writeFileSync(join(OUT_DIR, `titles-${range.id}.json`), JSON.stringify(titles));
  shards.forEach((shard, i) => writeFileSync(join(OUT_DIR, `employers-${range.id}-${i}.json`), JSON.stringify(shard)));
  meta.ranges.push({ id: range.id, label: range.label, from, to: today, postings: total, titles: titles.length });
  console.log(`${range.label}: ${total} postings, ${titles.length} job titles`);
}
writeFileSync(join(OUT_DIR, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
console.log(`Wrote ${readdirSync(OUT_DIR).length} files to ${OUT_DIR}/`);
