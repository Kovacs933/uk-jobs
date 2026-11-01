// Turns data/postings into the small files the website reads (site-data/):
//   meta.json                  when it was updated, totals per date range, how each site's crawl went
//   titles-<range>.json        [[job title, postings, key, also], ...], most postings first; `also` is
//                              the words of the title's other spellings, so a search can find them
//   employers-<range>-<n>.json { key: { e: [[employer, postings], ...], v: [[variant, postings], ...] } },
//                              split into SHARDS files
//
// Repeated titles ("Care Assistant - Nights", "Bank Care Assistant") share one row: see lib/titles.js.
// The same advert is often on more than one site. Postings with the same title, employer and
// posted date are counted once per site, and a group counts as many as the site with the most.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SHARDS, employerKey, shardOf } from './lib/normalise.js';
import { buildTitleGrouper } from './lib/titles.js';
import { SITES } from './sites/index.js';
import { addDays, isoDay, loadStatus, postingFiles, readPostings } from './store.js';

const OUT_DIR = 'site-data';
const RANGES = [
  { id: '7', label: 'Last 7 days', days: 7 },
  { id: '30', label: 'Last 30 days', days: 30 },
  { id: '90', label: 'Last 90 days', days: 90 },
  { id: 'all', label: 'Everything collected', days: Infinity },
];
const MAX_EMPLOYERS_PER_TITLE = 300;
const MAX_VARIANTS_PER_TITLE = 100;
const MAX_ALSO_CHARS = 150;

// accounts of advertising platforms that post adverts for many employers under their own name
const AD_PLATFORMS = new Map([['appcastenterprise', 'Appcast Enterprise (ad platform, real employer not shown)']]);

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

const employerName = (ek, spellings) => AD_PLATFORMS.get(ek) ?? bestName(spellings);

function buildRange(postings, group, range) {
  const from = range.days === Infinity ? '0000-00-00' : addDays(today, 1 - range.days);
  // "title|employer|day" -> site -> postings
  const groups = new Map();
  // key -> spelling -> postings, for the display name: whole titles (no variant) first, else
  // the kept part of each title ("PhD Studentship" from "PhD Studentship: <topic>")
  const wholeSpellings = new Map();
  const nameSpellings = new Map();
  // key -> lower-case variant -> spelling -> postings
  const variants = new Map();
  const employerSpellings = new Map();

  for (const p of postings) {
    if (p.d < from || p.d > today) continue;
    const { key: tk, name, variant } = group(p.t, p.e);
    const ek = employerKey(p.e);
    if (!tk) continue;
    const g = `${tk}|${ek}|${p.d}`;
    if (!groups.has(g)) groups.set(g, new Map());
    bump(groups.get(g), p.s);
    if (!nameSpellings.has(tk)) nameSpellings.set(tk, new Map());
    bump(nameSpellings.get(tk), name);
    if (!variant) {
      if (!wholeSpellings.has(tk)) wholeSpellings.set(tk, new Map());
      bump(wholeSpellings.get(tk), p.t);
    }
    if (variant) {
      if (!variants.has(tk)) variants.set(tk, new Map());
      const byLower = variants.get(tk);
      const lower = variant.toLowerCase();
      if (!byLower.has(lower)) byLower.set(lower, new Map());
      bump(byLower.get(lower), variant);
    }
    if (!employerSpellings.has(ek)) employerSpellings.set(ek, new Map());
    bump(employerSpellings.get(ek), p.e);
  }

  const titleCounts = new Map();
  const employersByTitle = new Map();
  let total = 0;
  for (const [g, perSite] of groups) {
    const count = Math.max(...perSite.values());
    const [tk, ek] = g.split('|');
    total += count;
    bump(titleCounts, tk, count);
    if (!employersByTitle.has(tk)) employersByTitle.set(tk, new Map());
    bump(employersByTitle.get(tk), ek, count);
  }

  // key -> [[variant, postings], ...], most first
  const variantLists = new Map();
  for (const [tk, byLower] of variants) {
    const list = [...byLower.values()]
      .map((spellings) => [bestName(spellings), [...spellings.values()].reduce((a, b) => a + b, 0)])
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    variantLists.set(tk, list);
  }

  /** The variants' words not already in the name, as one capped string for searching. */
  function also(tk, name) {
    const nameWords = new Set(name.toLowerCase().split(/[^a-z0-9+#]+/));
    const words = new Set();
    for (const [variant] of variantLists.get(tk) ?? []) {
      for (const w of variant.toLowerCase().split(/[^a-z0-9+#]+/)) if (w && !nameWords.has(w)) words.add(w);
    }
    let out = '';
    for (const w of words) {
      if (out.length + w.length + 1 > MAX_ALSO_CHARS) break;
      out += out ? ` ${w}` : w;
    }
    return out;
  }

  const titles = [...titleCounts]
    .map(([tk, count]) => {
      const name = bestName(wholeSpellings.get(tk) ?? nameSpellings.get(tk));
      return [name, count, tk, also(tk, name)];
    })
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  const shards = Array.from({ length: SHARDS }, () => ({}));
  for (const [tk, employers] of employersByTitle) {
    const sorted = [...employers].sort((a, b) => b[1] - a[1]);
    const list = sorted
      .slice(0, MAX_EMPLOYERS_PER_TITLE)
      .map(([ek, count]) => [employerName(ek, employerSpellings.get(ek)), count]);
    if (sorted.length > MAX_EMPLOYERS_PER_TITLE) {
      const rest = sorted.slice(MAX_EMPLOYERS_PER_TITLE);
      list.push([`${rest.length} other employers`, rest.reduce((sum, [, c]) => sum + c, 0)]);
    }
    const entry = { e: list };
    const v = variantLists.get(tk);
    if (v) entry.v = v.slice(0, MAX_VARIANTS_PER_TITLE);
    shards[shardOf(tk)][tk] = entry;
  }

  return { from, total, titles, shards };
}

const sites = loadStatus();
const postings = [];
// files are oldest first, one per day collected: the first file holding a site's postings is the
// day it was first collected, so the footer can say how far back each site goes
for (const file of postingFiles()) {
  for (const p of readPostings(file.path)) {
    postings.push(p);
    if (sites[p.s] && !sites[p.s].since) sites[p.s].since = file.day;
  }
}
// built from every stored posting, so a title has the same key in every date range
const group = buildTitleGrouper(postings);

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

// sites switched off in sites/index.js are listed as not collected, with the reason
for (const site of SITES) if (site.disabled) sites[site.id] = { ...sites[site.id], name: site.name, disabled: site.disabled };

const meta = { updated: new Date().toISOString(), today, ranges: [], sites };
for (const range of RANGES) {
  const { from, total, titles, shards } = buildRange(postings, group, range);
  writeFileSync(join(OUT_DIR, `titles-${range.id}.json`), JSON.stringify(titles));
  shards.forEach((shard, i) => writeFileSync(join(OUT_DIR, `employers-${range.id}-${i}.json`), JSON.stringify(shard)));
  meta.ranges.push({ id: range.id, label: range.label, from, to: today, postings: total, titles: titles.length });
  console.log(`${range.label}: ${total} postings, ${titles.length} job titles`);
}
writeFileSync(join(OUT_DIR, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
console.log(`Wrote ${readdirSync(OUT_DIR).length} files to ${OUT_DIR}/`);
