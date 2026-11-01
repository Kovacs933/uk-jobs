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

Collected: Reed (jobs added in the last three days, read daily: Reed serves only the first ~10,000
results of any search), NHS Jobs, CharityJob, jobs.ac.uk, Teaching Vacancies (the government's JSON
feed, under the Open Government Licence).

Switched off (`disabled` in `scraper/sites/index.js`; the code stays): GOV.UK Work Hub and SimplyHired,
which answer 403 to GitHub's servers.

Not collected: Indeed, Glassdoor, CV-Library, Hiring Cafe, Monster, Jora, HealthJobsUK and Civil Service
Jobs answer with a block page or bot check; LinkedIn, Totaljobs, CWJobs, Jobsite, Gumtree, Careerjet and
Community Care's robots.txt ask crawlers not to read their job or search pages; Robert Half draws its
job list in the browser. Each site's last crawl, and the day it was first collected, is shown at the
bottom of the website and in `data/status.json`.

Counting: the same advert on two sites (same title, employer and posting date) counts once. A job with
no posting date on its card counts from the day it was first seen.

Titles: repeated titles share one row (`scraper/lib/titles.js`). Qualifiers such as Bank, Nights, Part
time, Band 5 and a ward or place after a dash are folded into a known title ("Care Assistant - Nights",
"Bank Care Assistant") and listed under "Also advertised as". Level words (Senior, Lead, Trainee,
Apprentice...) and generic one-word titles ("Consultant - Neurology") keep their own rows. Grouping
happens when the website's data is built, so changing the rules needs no re-crawl.

Employers: Reed adverts placed through the Appcast ad platform are shown as "Appcast Enterprise (ad
platform, real employer not shown)"; the real employer is only named in the advert text.

## Running it yourself

```bash
npm install
npm test
node scraper/run.js --pages 2 --dry      # quick check of every site, saves nothing
node scraper/run.js --site reed          # one site (also runs a switched-off site)
node scraper/buildSiteData.js
node tools/serve.js                      # http://localhost:8080/site/
node tools/probe.js                      # what a plain request gets back from each site
```
