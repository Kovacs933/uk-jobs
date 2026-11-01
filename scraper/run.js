// Daily crawl: reads every site's UK-wide listing and saves the postings we haven't seen before.
//
//   node scraper/run.js                   all sites
//   node scraper/run.js --site reed       one site
//   node scraper/run.js --pages 2 --dry   a quick check: 2 pages per site, nothing saved
import { cleanTitle } from './lib/normalise.js';
import { fetchPage, sleep } from './lib/http.js';
import { SITES } from './sites/index.js';
import { addDays, isoDay, loadSeenIds, loadStatus, savePostings, saveStatus } from './store.js';

const LOOKBACK_DAYS = 30;

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const onlySite = option('site');
const pageLimit = option('pages') ? Number(option('pages')) : Infinity;
const dryRun = args.includes('--dry');
// pages read at the same time per site; each site sets its own, --concurrency overrides it for tests
const concurrencyOverride = option('concurrency') ? Number(option('concurrency')) : undefined;
// pages in a batch start this far apart, so a batch isn't a burst of simultaneous requests
const STAGGER_MS = 150;

const now = new Date();
const today = isoDay(now);
const log = (site, message) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${site.id}: ${message}`);

/**
 * Read one site page by page. Sites listed newest first stop once a whole page is older than
 * `stopDay`; the others are read to the end (or to maxPages).
 */
async function crawlSite(site, { seen, stopDay }) {
  const postings = [];
  const result = { pages: 0, found: 0, status: 'ok' };
  const maxPages = Math.min(site.maxPages, pageLimit);
  const concurrency = concurrencyOverride ?? site.concurrency;
  let lastLogged = 0;
  let oldPages = 0;

  // pages are fetched a few at a time but read in page order, so stopping works as it would one by one
  batches: for (let first = 1; first <= maxPages; first += concurrency) {
    const numbers = Array.from({ length: Math.min(concurrency, maxPages - first + 1) }, (_, i) => first + i);
    const pages = await Promise.all(
      numbers.map(async (n, i) => {
        await sleep(i * STAGGER_MS);
        try {
          return { n, parsed: site.parse(await fetchPage(site.pageUrl(n)), now) };
        } catch (error) {
          return { n, error };
        }
      }),
    );

    for (const { n, parsed, error } of pages) {
      if (error) {
        result.status = 'error';
        result.error = error.message;
        break batches;
      }
      result.pages = n;
      // a page whose cards were all skipped (Work Hub copies of NHS Jobs adverts) isn't the end
      if (!parsed.listFound || parsed.cards === 0) {
        // past the last page; on page 1 it means the layout changed or we were blocked
        if (n === 1) {
          result.status = 'error';
          result.error = 'no job list on page 1 (the site may have changed its layout)';
        }
        break batches;
      }

      let newestDay = '';
      for (const job of parsed.jobs) {
        result.found++;
        // a job with no posting date counts from the day we first saw it
        const day = job.postedAt ? job.postedAt.slice(0, 10) : today;
        if (day > newestDay) newestDay = day;
        const id = `${site.id}-${job.id}`;
        if (seen.has(id)) continue;
        seen.add(id);
        postings.push({ id, s: site.id, t: cleanTitle(job.title, job.location), e: job.employer, d: day });
      }
      // sites that list roughly newest first can still put a few old adverts early, so stop only
      // after several old pages in a row
      oldPages = newestDay && newestDay < stopDay ? oldPages + 1 : 0;
      if (site.sortedByDate && oldPages >= (site.oldPagesToStop ?? 3)) break batches;
    }

    if (result.pages - lastLogged >= 100) {
      lastLogged = result.pages;
      log(site, `page ${result.pages}, ${postings.length} new so far`);
    }
    await sleep(site.delayMs);
  }

  log(site, `${result.status} - ${result.pages} pages, ${result.found} jobs read, ${postings.length} new${result.error ? ` (${result.error})` : ''}`);
  return { postings, result };
}

const sites = SITES.filter((site) => !onlySite || site.id === onlySite);
if (sites.length === 0) {
  console.error(`Unknown site "${onlySite}". Sites: ${SITES.map((s) => s.id).join(', ')}`);
  process.exit(1);
}

const status = loadStatus();
// jobs stay listed for weeks, so remembering 120 days of ids is plenty to spot repeats
const seen = loadSeenIds(addDays(today, -120));
const earliest = addDays(today, -LOOKBACK_DAYS);

const results = await Promise.all(
  sites.map((site) => {
    // after a good crawl, only go back a couple of days before it; the first crawl backfills 30 days
    const lastOk = status[site.id]?.lastOk;
    const stopDay = lastOk && addDays(lastOk, -2) > earliest ? addDays(lastOk, -2) : earliest;
    return crawlSite(site, { seen, stopDay });
  }),
);

const postings = results.flatMap((r) => r.postings);
console.log(`\n${postings.length} new postings in total.`);
if (dryRun) {
  console.log('Dry run: nothing saved. Sample:', postings.slice(0, 5));
} else {
  if (postings.length) console.log(`Saved to ${savePostings(today, postings)}`);
  sites.forEach((site, i) => {
    const { result, postings: found } = results[i];
    status[site.id] = {
      name: site.name,
      lastRun: now.toISOString(),
      // a crawl cut short with --pages doesn't count, or the next crawl would skip the backfill
      lastOk: result.status === 'ok' && pageLimit === Infinity ? today : status[site.id]?.lastOk,
      ...result,
      new: found.length,
    };
  });
  saveStatus(status);
}

// fail the run (so GitHub shows it) only when every site failed
if (results.every((r) => r.result.status !== 'ok')) process.exit(1);
