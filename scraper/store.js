// The collected postings live in data/postings, one gzipped file of new postings per day
// (one JSON object per line). Files are only ever added to, never rewritten, which keeps the
// git history small. data/status.json remembers how each site's last crawl went.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

export const DATA_DIR = 'data';
const POSTINGS_DIR = join(DATA_DIR, 'postings');
const STATUS_FILE = join(DATA_DIR, 'status.json');

/** "2026-11-01" for a date, in UTC. */
export const isoDay = (date) => date.toISOString().slice(0, 10);

export function addDays(day, days) {
  return isoDay(new Date(Date.parse(`${day}T12:00:00Z`) + days * 86_400_000));
}

/** Posting files, oldest first, as { day, path }. */
export function postingFiles() {
  if (!existsSync(POSTINGS_DIR)) return [];
  return readdirSync(POSTINGS_DIR)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.ndjson\.gz$/.test(name))
    .sort()
    .map((name) => ({ day: name.slice(0, 10), path: join(POSTINGS_DIR, name) }));
}

export function readPostings(path) {
  return gunzipSync(readFileSync(path))
    .toString('utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

/** Ids of postings collected on or after `sinceDay`, so a re-listed job isn't counted twice. */
export function loadSeenIds(sinceDay) {
  const seen = new Set();
  for (const file of postingFiles()) {
    if (file.day < sinceDay) continue;
    for (const posting of readPostings(file.path)) seen.add(posting.id);
  }
  return seen;
}

/** Save the day's new postings, adding to that day's file if the crawl already ran today. */
export function savePostings(day, postings) {
  mkdirSync(POSTINGS_DIR, { recursive: true });
  const path = join(POSTINGS_DIR, `${day}.ndjson.gz`);
  const all = existsSync(path) ? readPostings(path).concat(postings) : postings;
  writeFileSync(path, gzipSync(all.map((p) => JSON.stringify(p)).join('\n') + '\n'));
  return path;
}

export function loadStatus() {
  return existsSync(STATUS_FILE) ? JSON.parse(readFileSync(STATUS_FILE, 'utf8')) : {};
}

export function saveStatus(status) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2) + '\n');
}
