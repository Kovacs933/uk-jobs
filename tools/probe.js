// Fetches page 1 of each site's UK-wide listing and reports what a plain HTTP request gets back.
// Usage: node tools/probe.js [siteId]
import { DOMParser } from 'linkedom';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

const PROBES = [
  { id: 'reed', url: 'https://www.reed.co.uk/jobs?sortBy=displayDate', card: 'article[data-qa="job-card"]' },
  { id: 'totaljobs', url: 'https://www.totaljobs.com/jobs?sort=2', card: 'article[data-at="job-item"]' },
  { id: 'cvlibrary', url: 'https://www.cv-library.co.uk/jobs?order=date', card: '[itemprop="itemListElement"]' },
  { id: 'nhs', url: 'https://www.jobs.nhs.uk/candidate/search/results?sort=publicationDateDesc', card: 'li[data-test="search-result"]' },
  { id: 'workhub', url: 'https://www.jobs.service.gov.uk/jobs/search', card: '[data-testid^="searchResultCard-"]' },
  { id: 'charityjob', url: 'https://www.charityjob.co.uk/jobs', card: 'article.job-card-wrapper[job-id]' },
  { id: 'jobsacuk', url: 'https://www.jobs.ac.uk/search/?sortOrder=1', card: '.j-search-result__result[data-advert-id]' },
  { id: 'simplyhired', url: 'https://www.simplyhired.co.uk/search?q=&l=United+Kingdom', card: '[data-testid="searchSerpJob"]' },
  { id: 'gumtree', url: 'https://www.gumtree.com/jobs', card: 'article[data-q="search-result"]' },
  { id: 'indeed', url: 'https://uk.indeed.com/jobs?q=&l=United+Kingdom&sort=date', card: '.job_seen_beacon, [data-jk]' },
  { id: 'linkedin', url: 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?location=United%20Kingdom&start=0', card: 'li' },
  { id: 'glassdoor', url: 'https://www.glassdoor.co.uk/Job/united-kingdom-jobs-SRCH_IL.0,14_IN2.htm', card: '[data-test="jobListing"], li[data-jobid]' },
  { id: 'roberthalf', url: 'https://www.roberthalf.com/gb/en/jobs', card: '[data-testid*="job"], rhcl-job-card' },
  { id: 'hiringcafe', url: 'https://hiring.cafe/', card: 'a[href*="/viewjob/"]' },
];

async function robotsAllows(url) {
  const { origin, pathname } = new URL(url);
  try {
    const res = await fetch(`${origin}/robots.txt`, { headers: { 'user-agent': UA } });
    if (!res.ok) return `robots ${res.status}`;
    const lines = (await res.text()).split(/\r?\n/);
    // only the "User-agent: *" group matters for us
    let inStar = false;
    const disallows = [];
    for (const raw of lines) {
      const line = raw.replace(/#.*/, '').trim();
      const [key, ...rest] = line.split(':');
      const value = rest.join(':').trim();
      if (/^user-agent$/i.test(key)) inStar = value === '*';
      else if (inStar && /^disallow$/i.test(key) && value) disallows.push(value);
    }
    // robots.txt patterns: "*" matches anything, a trailing "$" anchors the end
    const target = pathname + new URL(url).search;
    const toRegex = (d) =>
      new RegExp('^' + d.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$|\$$/, '$'));
    const hit = disallows.find((d) => toRegex(d).test(target));
    return hit ? `DISALLOWED by "${hit}"` : 'allowed';
  } catch (e) {
    return `robots error ${e.message}`;
  }
}

const only = process.argv[2];
const extra = process.argv[3];
const list = extra ? [{ id: only, url: extra, card: PROBES.find((p) => p.id === only)?.card ?? 'article' }] : PROBES;
for (const p of list.filter((p) => !only || p.id === only)) {
  const robots = await robotsAllows(p.url);
  try {
    const res = await fetch(p.url, { headers: { 'user-agent': UA, 'accept-language': 'en-GB,en;q=0.9', accept: 'text/html' } });
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const cards = doc.querySelectorAll(p.card).length;
    const title = doc.querySelector('title')?.textContent?.trim().slice(0, 60);
    const total = html.match(/([\d,]{4,})\s*(?:jobs|results|vacancies)/i)?.[1];
    console.log(`${p.id.padEnd(12)} ${res.status} ${String(html.length).padStart(8)}b cards=${cards} total=${total ?? '-'} | ${robots} | ${title}`);
  } catch (e) {
    console.log(`${p.id.padEnd(12)} ERROR ${e.message} | ${robots}`);
  }
}
