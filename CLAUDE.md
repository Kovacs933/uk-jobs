# UK job postings site

Website listing job titles advertised across the UK, ranked by number of postings, with search, sorting, a date range and the employers behind each title. README.md explains how it works; this file is the working state.

## Where things are
- Repo: github.com/Kovacs933/uk-jobs (public, needed for free Actions minutes and so the site can read its data from raw.githubusercontent.com).
- Live site: https://timely-arithmetic-b0d9a9.netlify.app (Netlify serves `site/`, no build; `netlify.toml` skips deploys that don't touch `site/`).
- Daily GitHub Actions run (`.github/workflows/daily.yml`, 03:15 UTC): `scraper/run.js` then `scraper/buildSiteData.js`, commits `data/` and `site-data/`.
- Git: use GitHub Desktop's bundled git (`%LOCALAPPDATA%\GitHubDesktop\app-*\resources\app\git\cmd\git.exe`). It can't push from here (no credentials): ask Edward to click Push origin in GitHub Desktop. Same for GitHub/Netlify sign-ins: ask him, never enter passwords.
- The Actions run commits data to GitHub, so `git fetch` and `git pull --rebase` before looking at `data/` or `site-data/`.

## Decisions (Edward's)
- All UK jobs, all sectors, no location or distance. Show job title and employer only.
- List = one row per job title, most postings first; search, sortable columns, expand a title for employers. No trend chart, no other filters.
- Default last 30 days, keep all history. Refresh once a day.
- Sites set up: Reed, GOV.UK Work Hub, NHS Jobs, CharityJob, jobs.ac.uk, SimplyHired (Work Hub and SimplyHired are blocked from GitHub's servers, see State). Not collected: Indeed, Glassdoor, CV-Library, Hiring Cafe (block pages), LinkedIn, Totaljobs, Gumtree (robots.txt asks crawlers not to read search pages), Robert Half (needs a browser). Don't try to get around blocks.
- Model: Sonnet 5.5 at medium effort for normal work; Edward approved Opus 5.5 subagents for hard, self-contained tasks only.

## State (1 Nov 2026, 16:05 UTC)
- Run #2 (commit 0007d8f, started by hand 15:35 UTC) finished OK in 28 min and committed "Job data for 2026-11-01" (263 files, 7 MB). The live site loads it: 23,835 postings and 14,576 titles in the last 30 days. Top: Care Assistant 436, Salaried GP 174, Support Worker 148, Practice Nurse 116. "support worker" matches 286 titles (exact: 148), "finance manager" 26 (exact: 36).
- New postings per site: Reed 10,018, NHS Jobs 10,770, CharityJob 1,753, jobs.ac.uk 1,450. **Work Hub and SimplyHired failed with 403 from GitHub's servers** on page 1. Both read fine from Edward's PC earlier, so it looks like a block on GitHub's addresses. Don't try to get around it; ask Edward what he wants.
- **Reed stops serving new results after its first ~10,000**: run #2 read 6,000 pages (162,000 jobs) but only 10,018 were distinct, so about 5,600 pages were repeats. That took most of the 28 minutes, sent Reed pointless requests, and means Reed coverage is only that first 10,000. It will do the same at 03:15 UTC tonight unless fixed.
- NHS Jobs (stopped after 1,077 pages at the 30-day edge), CharityJob and jobs.ac.uk look right.
- So the list is a partial picture of UK jobs, skewed to NHS and Reed's first 10,000. Say so when reporting numbers.
- Work Hub "most recent" order is only roughly by date, so it stops after 15 old pages in a row (`oldPagesToStop`), and pages of only skipped NHS copies are not the end of a list.

## Next
1. Fix Reed (runs again at 03:15 UTC): stop a crawl when several pages in a row hold only ids already seen in this run, then reach past the 10,000 cap by slicing Reed's search (sector pages and/or date filters; check which URLs Reed has and that its robots.txt allows them; each slice has its own cap). Test with `node scraper/run.js --site reed --pages 3 --dry`.
2. Ask Edward about Work Hub and SimplyHired: accept losing them, or collect them from his PC (`node scraper/run.js --site workhub`). That avoids GitHub's block but is a way round it, so it is his call.
3. Tidy job titles (Edward asked for this): group near-duplicates such as "Support Worker - Extra Care" with "Support Worker" without hiding real differences. The live list shows what to group, e.g. "Care Assistant - Nights" and "Care Assistant - Bank", "Health Care Assistant" and "Healthcare Assistant". `cleanTitle`/`titleKey` in `scraper/lib/normalise.js`; the site has a copy of `titleKey`/`shardOf` in `site/app.js`, keep them in step.
4. Confirm the 03:15 UTC run only collects new jobs and the site updates.
5. Optional: Robert Half via a browser-based scraper.

## Commands
`npm test` (8 tests), `node scraper/run.js --pages 2 --dry`, `node scraper/run.js --site reed`, `node scraper/buildSiteData.js`, `node tools/serve.js` (http://localhost:8080/site/), `node tools/probe.js`.
