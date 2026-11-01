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
- Sites collected: Reed, NHS Jobs, CharityJob, jobs.ac.uk, Teaching Vacancies. Work Hub and SimplyHired are switched off (`disabled`, 403 from GitHub's servers); Edward chose to leave them out for now, not to collect them from his PC. Not collected: Indeed, Glassdoor, CV-Library, Hiring Cafe, Monster, Jora, HealthJobsUK, Civil Service Jobs (block pages/bot checks), LinkedIn, Totaljobs, CWJobs, Jobsite, Gumtree, Careerjet, Community Care (robots.txt), Robert Half (needs a browser), Guardian Jobs (closed Oct 2026), CareerBuilder UK (unreachable), Talent.com (parked: re-posts other boards, no posted dates). Don't try to get around blocks.
- Repeated titles are merged into one row (no sector layer). Rules in `scraper/lib/titles.js`, cautious by design: two rows for one job beats one row hiding two jobs. Fix wrong merges in the rules, never in the data.
- Appcast Enterprise is an ad platform on Reed, not an employer: shown labelled, still counted (each is a real advert).
- Model: Sonnet 5.5 at medium effort for normal work; Edward approved Opus 5.5 subagents for hard, self-contained tasks only.

## State (1 Nov 2026, 17:00 UTC)
- Local commits not yet pushed (Edward clicks Push origin): Reed fix (9ad7f85), title merging + site + rebuilt site-data (8f5efd1), Teaching Vacancies (94fce43), docs/footer. The live site still shows the old format until the push; the client reads both formats.
- Reed now reads `/jobs?dateCreatedOffSet=lastthreedays` (about 7,500 jobs, 250 pages) with `seenPagesToStop: 3` (stop after 3 pages holding only ids already read in this run; Reed repeats results past its ~10,000 cap). Reed's 30-day view fills in over the next month; before this fix we only held Reed's first 10,018 (29 Oct-1 Nov). Check after the 03:15 UTC run: `data/status.json` should show Reed at about 250 pages and a few minutes, not 6,000 pages and 28 minutes.
- Title merging on the 1 Nov data: 30-day rows 14,576 -> 11,676 (titles-30.json 0.96 MB). Care Assistant 557, Salaried GP 217, Support Worker 206, Registered Nurse 190, Healthcare Assistant 180, PhD Studentship 177. "support worker" matches 169 titles (was 286). Merge report (50 biggest + 50 random) checked by hand, no wrong merges found.
- Teaching Vacancies: `api/v1/jobs.json?page=N`, 64 pages of 100 (6,354 live), every page read daily at 1 s, page 65 is empty. Terms: Open Government Licence, plus no fees for hiring respondents (we charge nothing). Attribution is in the footer. First full run not yet done.
- The footer lists each site's "collected since" day (first posting file holding that site) and switched-off sites as "not collected".
- The list is still a partial picture of UK jobs, skewed to NHS. Say so when reporting numbers.

## Next
1. After the push: start a run by hand (Actions -> Daily job collection -> Run workflow) or wait for 03:15 UTC; check Reed's pages/time and Teaching Vacancies' count in `site-data/meta.json`.
2. Adzuna (needs Edward): he registers at developer.adzuna.com/signup and adds repo secrets `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` (never handle the keys). Then read Adzuna's terms and his dashboard limits, add `scraper/sites/adzuna.js` reading `https://api.adzuna.com/v1/api/jobs/gb/search/N?results_per_page=50&sort_by=date&max_days_old=2` with keys from the environment, pass the secrets in `daily.yml`, skip quietly with no keys, report a quota stop as ok with a note. After 3 days measure overlap with existing postings; keep only if it adds enough.
3. Next-tier boards, one at a time, each through the gate (robots allows the listing URL; a plain request returns 20+ cards with title and employer; newest-first or posted dates; no human check; works from GitHub via a workflow_dispatch dry run), and added to `tools/probe.js`: TES (needs a UK filter), Jobs Go Public and LGJobs (`delayMs` 10,000), Eteach, Technojobs (home page redirected to /lander), Escape the City.
4. Optional: a one-off Reed week backfill by region slices, only if robots allows those URLs. Robert Half via a browser-based scraper.

## Commands
`npm test` (15 tests), `node scraper/run.js --pages 2 --dry`, `node scraper/run.js --site reed` (also runs a switched-off site), `node scraper/buildSiteData.js`, `node tools/serve.js` (http://localhost:8080/site/), `node tools/probe.js`.
