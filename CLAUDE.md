# UK job postings site

Website listing job titles advertised across the UK, ranked by number of postings, with search, sorting, a date range and the employers behind each title. README.md explains how it works; this file is the working state.

## Where things are
- Repo: github.com/Kovacs933/uk-jobs (public, needed for free Actions minutes and so the site can read its data from raw.githubusercontent.com).
- Live site: https://timely-arithmetic-b0d9a9.netlify.app (Netlify serves `site/`, no build; `netlify.toml` skips deploys that don't touch `site/`).
- Daily GitHub Actions run (`.github/workflows/daily.yml`, 03:15 UTC): `scraper/run.js` then `scraper/buildSiteData.js`, commits `data/` and `site-data/`.
- Git: use GitHub Desktop's bundled git (`%LOCALAPPDATA%\GitHubDesktop\app-*\resources\app\git\cmd\git.exe`). It can't push from here (no credentials): ask Edward to click Push origin in GitHub Desktop. Same for GitHub/Netlify sign-ins: ask him, never enter passwords.

## Decisions (Edward's)
- All UK jobs, all sectors, no location or distance. Show job title and employer only.
- List = one row per job title, most postings first; search, sortable columns, expand a title for employers. No trend chart, no other filters.
- Default last 30 days, keep all history. Refresh once a day.
- Sites collected: Reed, GOV.UK Work Hub, NHS Jobs, CharityJob, jobs.ac.uk, SimplyHired. Not collected: Indeed, Glassdoor, CV-Library, Hiring Cafe (block pages), LinkedIn, Totaljobs, Gumtree (robots.txt asks crawlers not to read search pages), Robert Half (needs a browser). Don't try to get around blocks.
- Model: Sonnet 5.5 at medium effort for normal work; Edward approved Opus 5.5 subagents for hard, self-contained tasks only.

## State (1 Nov 2026)
- Run #2 of the workflow was started by hand at 15:35 UTC on commit 0007d8f (several pages at a time, Work Hub early-stop fix). It should take about 15-30 min. Run #1 was cancelled (old code).
- Not yet checked: `data/status.json` per-site counts after run #2, and the live site showing jobs. Until run #2 saves `site-data/meta.json` the site shows "couldn't load the job data".
- Work Hub "most recent" order is only roughly by date, so it stops after 15 old pages in a row (`oldPagesToStop`), and pages of only skipped NHS copies are not the end of a list.

## Next
1. When Edward is back: check run #2 (GitHub API `actions/runs`, no sign-in needed since the repo is public), read `data/status.json`, load the live site, search "support worker" and "finance manager".
2. Tidy job titles (Edward asked for this): group near-duplicates such as "Support Worker - Extra Care" with "Support Worker" without hiding real differences. `cleanTitle`/`titleKey` in `scraper/lib/normalise.js`; the site has a copy of `titleKey`/`shardOf` in `site/app.js`, keep them in step.
3. Optional: Robert Half via a browser-based scraper.
4. Confirm the 03:15 UTC run only collects new jobs and the site updates.

## Commands
`npm test` (8 tests), `node scraper/run.js --pages 2 --dry`, `node scraper/run.js --site reed`, `node scraper/buildSiteData.js`, `node tools/serve.js` (http://localhost:8080/site/), `node tools/probe.js`.
