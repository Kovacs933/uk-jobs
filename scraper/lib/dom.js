// HTML helpers shared by the site parsers (ported from Foundation's ukBoards.ts).
import { DOMParser } from 'linkedom';

export function parseDocument(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

/** Collapsed, trimmed text content of an element (undefined when empty). */
export function text(el) {
  const value = el?.textContent?.replace(/\s+/g, ' ').trim();
  return value || undefined;
}

/** Some boards have no list element at all when a search returns nothing, so sniff the page text. */
export function looksLikeNoResults(document) {
  const pageText = document.body?.textContent?.replace(/\s+/g, ' ') ?? '';
  return /no (?:matching )?(?:jobs|results|vacancies) (?:were )?(?:found|match)|didn['’]t match any|0 jobs found|we couldn['’]t find any|sorry, we (?:could not|couldn['’]t) find/i.test(
    pageText,
  );
}

/**
 * Turn the job cards on a page into jobs, skipping cards that are missing a field or throw.
 * `listFound` is false when the page has no job list at all (a layout change or a block page).
 */
export function cardsToResult(document, cards, parseCard) {
  if (cards.length === 0) return { listFound: looksLikeNoResults(document), jobs: [], cards: 0 };
  const jobs = [];
  for (const card of cards) {
    try {
      const job = parseCard(card);
      if (job && job.id && job.title && job.employer) jobs.push(job);
    } catch {
      // one broken card shouldn't lose the rest of the page
    }
  }
  // `cards` is how many job cards the page had, which can be more than `jobs` when some are skipped
  return { listFound: true, jobs, cards: cards.length };
}
