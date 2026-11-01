# UK job postings

A website listing the job titles advertised across the UK, ranked by how many postings each has,
with search, sorting, a date range (last 7, 30 or 90 days, or everything collected) and the employers
behind each title.

## How it works

1. **Every day at 03:15 UTC** a GitHub Actions run (`.github/workflows/daily.yml`) reads each job
   site's UK-wide listing page by page (`scraper/run.js`) and saves the postings it hasn't seen before
   to `data/postings/<day>.ndjson.gz`. The first run reads back 30 days.
2. It then rebuilds the small files the website reads (`scraper/buildSiteData.js` -> `site-data/`),
   and commits both.
3. The website (`site/`, hosted on Netlify) loads `site-data/` straight from this GitHub repository,
   so Netlify only redeploys when the website itself changes.

The approach (board list, page downloader that backs off when rate limited, and per-site card
readers) is ported from Foundation; the card selectors come from its `ukBoards.ts`.

## Sites

Collected: Reed, GOV.UK Work Hub, NHS Jobs, CharityJob, jobs.ac.uk, SimplyHired (first 300 pages a day).

Not collected: Indeed, Glassdoor, CV-Library and Hiring Cafe answer with a block page or bot check;
LinkedIn, Totaljobs and Gumtree's robots.txt ask crawlers not to read their search pages; Robert Half
draws its job list in the browser. Each site's last crawl is shown at the bottom of the website and in
`data/status.json`.

Counting: the same advert on two sites (same title, employer and posting date) counts once. A job with
no posting date on its card counts from the day it was first seen.

## Running it yourself

```bash
npm install
npm test
node scraper/run.js --pages 2 --dry      # quick check of every site, saves nothing
node scraper/run.js --site reed          # one site
node scraper/buildSiteData.js
node tools/serve.js                      # http://localhost:8080/site/
node tools/probe.js                      # what a plain request gets back from each site
```
