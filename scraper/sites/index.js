// Every job site we collect from. Selectors come from Foundation's ukBoards.ts (checked Oct 2026).
//
// Each site: id, name, url (home page), pageUrl(n) for page n of its UK-wide listing,
// parse(html, now) -> { listFound, jobs: [{ id, title, employer, location, postedAt }] },
// sortedByDate (newest first, so a crawl can stop at older jobs), maxPages and delayMs.
//
// Not collected, and why (Nov 2026):
//   Indeed, Glassdoor, CV-Library, Hiring Cafe - answer with a block page or bot check;
//   we don't try to get around those.
//   LinkedIn (Disallow: /), Totaljobs/CWJobs (search pages), Gumtree (pages 2+) - their
//   robots.txt asks crawlers not to fetch those pages.
//   Robert Half - its job list is drawn in the browser, so a plain download gets no jobs.
import { cardsToResult, parseDocument, text } from '../lib/dom.js';
import { findPostedDate, parsePostedText } from '../lib/postedDate.js';

const reed = {
  id: 'reed',
  name: 'Reed',
  url: 'https://www.reed.co.uk',
  // Reed can't be sorted by date from a link, so the whole listing is read every day
  sortedByDate: false,
  maxPages: 6000,
  concurrency: 6,
  delayMs: 250,
  pageUrl: (n) => `https://www.reed.co.uk/jobs?pageno=${n}`,
  parse(html, now) {
    const document = parseDocument(html);
    const cards = Array.from(document.querySelectorAll('article[data-qa="job-card"]'));
    if (cards.length === 0 && document.querySelector('[data-qa="alert-no-results-criteria"]')) {
      return { listFound: true, jobs: [], cards: 0 };
    }
    return cardsToResult(document, cards, (el) => {
      const titleEl = el.querySelector('a[data-qa="job-card-title"]');
      const postedBy = text(el.querySelector('[data-qa="job-posted-by"]'));
      return {
        id: titleEl?.getAttribute('data-id') || el.getAttribute('data-id')?.replace(/^job/, ''),
        title: text(titleEl),
        employer: text(el.querySelector('[data-qa="job-posted-by"] a')),
        location: text(el.querySelector('[data-qa="job-metadata-location"]')),
        // ex: "18 September by Exam Papers Plus", "Yesterday by ...", "1 hr ago by ..."
        postedAt: parsePostedText(postedBy?.split(' by ')[0], now),
      };
    });
  },
};

const workHub = {
  id: 'workhub',
  name: 'GOV.UK Work Hub',
  url: 'https://www.jobs.service.gov.uk',
  // "Most recent" is only roughly by date: a page of June adverts can sit among 31 October ones
  sortedByDate: true,
  oldPagesToStop: 15,
  maxPages: 4000,
  concurrency: 4,
  delayMs: 500,
  pageUrl: (n) => `https://www.jobs.service.gov.uk/jobs/search?sortOption=DATE&resultsPerPage=30&pageNumber=${n}`,
  parse(html, now) {
    const document = parseDocument(html);
    const cards = Array.from(document.querySelectorAll('[data-testid^="searchResultCard-"]'));
    return cardsToResult(document, cards, (el) => {
      // ex: <span>Jobandtalent</span><span> - Altrincham, Greater Manchester</span>
      const [companyEl, locationEl] = Array.from(el.querySelectorAll('[data-testid="searchResultCardEmployer"] > span'));
      const employer = text(companyEl);
      // NHS Jobs adverts are copied onto Work Hub under the name "NHS Jobs"; we read NHS Jobs itself
      if (!employer || /^nhs jobs$/i.test(employer)) return null;
      return {
        id: el.getAttribute('data-testid')?.replace('searchResultCard-', ''),
        title: text(el.querySelector('a[data-testid^="jobTitle-"]')),
        employer,
        location: text(locationEl)?.replace(/^-\s*/, ''),
        // ex: "Added on 6 Oct 2026"
        postedAt: findPostedDate(el, now),
      };
    });
  },
};

const nhsJobs = {
  id: 'nhs',
  name: 'NHS Jobs',
  url: 'https://www.jobs.nhs.uk',
  sortedByDate: true,
  maxPages: 2000,
  concurrency: 4,
  delayMs: 500,
  pageUrl: (n) => `https://www.jobs.nhs.uk/candidate/search/results?sort=publicationDateDesc&page=${n}`,
  parse(html, now) {
    const document = parseDocument(html);
    const cards = Array.from(document.querySelectorAll('li[data-test="search-result"]'));
    return cardsToResult(document, cards, (el) => {
      const titleEl = el.querySelector('a[data-test="search-result-job-title"]');
      const href = titleEl?.getAttribute('href')?.split('?')[0];
      // the heading holds the employer name followed by the address in a nested div
      const employerEl = el.querySelector('[data-test="search-result-location"] h3');
      const location = text(employerEl?.querySelector('.location-font-size'));
      let employer = text(employerEl);
      if (employer && location) employer = employer.replace(location, '').trim();
      return {
        id: href?.split('/').filter(Boolean).pop(),
        title: text(titleEl),
        employer,
        location,
        // ex: "Date posted: 9 October 2026"
        postedAt: findPostedDate(el, now),
      };
    });
  },
};

const charityJob = {
  id: 'charityjob',
  name: 'CharityJob',
  url: 'https://www.charityjob.co.uk',
  // newest first; the site stops listing after about 110 pages
  sortedByDate: true,
  maxPages: 200,
  concurrency: 3,
  delayMs: 500,
  pageUrl: (n) => `https://www.charityjob.co.uk/jobs?page=${n}`,
  parse(html, now) {
    const document = parseDocument(html);
    const cards = Array.from(document.querySelectorAll('article.job-card-wrapper[job-id]'));
    return cardsToResult(document, cards, (el) => {
      // the organisation line is "<charity>, <location>", the charity name is also the logo's title
      const organisation = text(el.querySelector('.organisation'));
      const employer =
        el.querySelector('.logo a')?.getAttribute('title')?.trim() || organisation?.split(',')[0]?.trim();
      const location =
        employer && organisation?.startsWith(employer)
          ? organisation.slice(employer.length).replace(/^,\s*/, '').trim() || undefined
          : undefined;
      return {
        id: el.getAttribute('job-id')?.trim(),
        title: text(el.querySelector('.job-title a')) ?? text(el.querySelector('.job-title span')),
        employer,
        location,
        postedAt: parsePostedText(text(el.querySelector('.posted-item')), now),
      };
    });
  },
};

const jobsAcUk = {
  id: 'jobsacuk',
  name: 'jobs.ac.uk',
  url: 'https://www.jobs.ac.uk',
  sortedByDate: false,
  maxPages: 400,
  concurrency: 3,
  delayMs: 500,
  pageUrl: (n) => `https://www.jobs.ac.uk/search/?sortOrder=1&pageSize=25&startIndex=${(n - 1) * 25 + 1}`,
  parse(html, now) {
    const document = parseDocument(html);
    const cards = Array.from(document.querySelectorAll('.j-search-result__result[data-advert-id]'));
    return cardsToResult(document, cards, (el) => {
      const details = Array.from(el.querySelectorAll('.j-search-result__text > div')).map((div) => text(div) ?? '');
      return {
        id: el.getAttribute('data-advert-id')?.trim(),
        title: text(el.querySelector('.j-search-result__text > a')),
        employer: text(el.querySelector('.j-search-result__employer')),
        location: details.find((d) => d.startsWith('Location:'))?.replace('Location:', '').trim(),
        // ex: "Date Placed: 16 Oct"
        postedAt: findPostedDate(el, now),
      };
    });
  },
};

const simplyHired = {
  id: 'simplyhired',
  name: 'SimplyHired',
  url: 'https://www.simplyhired.co.uk',
  // the listing is very large and not in date order, so only the first pages are read each day
  sortedByDate: false,
  maxPages: 300,
  concurrency: 3,
  delayMs: 500,
  pageUrl: (n) => `https://www.simplyhired.co.uk/search?q=&l=United+Kingdom&pn=${n}`,
  parse(html, now) {
    const document = parseDocument(html);
    const cards = Array.from(document.querySelectorAll('[data-testid="searchSerpJob"]'));
    return cardsToResult(document, cards, (el) => ({
      id: el.getAttribute('data-jobkey')?.trim(),
      title: text(el.querySelector('[data-testid="searchSerpJobTitle"] a')),
      employer: text(el.querySelector('[data-testid="companyName"]')),
      location: text(el.querySelector('[data-testid="searchSerpJobLocation"]')),
      // ex: "14d", "5h"
      postedAt: parsePostedText(text(el.querySelector('[data-testid="searchSerpJobDateStamp"]')), now),
    }));
  },
};

export const SITES = [reed, workHub, nhsJobs, charityJob, jobsAcUk, simplyHired];
