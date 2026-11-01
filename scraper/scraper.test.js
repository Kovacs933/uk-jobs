import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { findPostedDate, parsePostedText } from './lib/postedDate.js';
import { cleanTitle, employerKey, shardOf } from './lib/normalise.js';
import { parseDocument } from './lib/dom.js';
import { SITES } from './sites/index.js';

const now = new Date('2026-11-01T10:00:00Z');
const day = (value) => parsePostedText(value, now)?.slice(0, 10);

test('posted dates in the forms the sites use', () => {
  assert.equal(day('1 hr ago'), '2026-11-01');
  assert.equal(day('3 days ago'), '2026-10-29');
  assert.equal(day('Yesterday'), '2026-10-31');
  assert.equal(day('Just posted'), '2026-11-01');
  assert.equal(day('Posted 2 weeks ago'), '2026-10-18');
  assert.equal(day('23 October'), '2026-10-23');
  assert.equal(day('Date posted: 9 October 2026'), '2026-10-09');
  assert.equal(day('8d'), '2026-10-24');
  assert.equal(day('30d+'), '2026-10-02');
  // a date in the future is a closing date, not a posting date
  assert.equal(day('15 November 2026'), undefined);
  // "28 December" with no year is last December
  assert.equal(day('28 December'), '2025-12-28');
});

test('findPostedDate skips closing dates on a card', () => {
  const doc = parseDocument('<li><p>Closing date: 30 October 2026</p><p>Date posted: 9 October 2026</p></li>');
  assert.equal(findPostedDate(doc.querySelector('li'), now)?.slice(0, 10), '2026-10-09');
});

test('cleanTitle drops salaries and the job town', () => {
  assert.equal(cleanTitle('Nursery Assistant, Basingstoke', 'Basingstoke'), 'Nursery Assistant');
  assert.equal(cleanTitle('Retail Stocktaker - Kilmarnock - £14.29 p/hr*', 'Kilmarnock'), 'Retail Stocktaker');
  assert.equal(cleanTitle('Care Worker (Leeds)', 'Leeds, West Yorkshire'), 'Care Worker');
  assert.equal(cleanTitle('Nursery Practitioner (Lunch Cover)', 'Leeds'), 'Nursery Practitioner (Lunch Cover)');
  assert.equal(cleanTitle('  Support   Worker  ', undefined), 'Support Worker');
});

test('employer keys ignore case, punctuation, spaces and company suffixes', () => {
  assert.equal(employerKey('Acme Care Ltd.'), employerKey('ACME CARE LIMITED'));
  assert.equal(employerKey('Smith & Sons'), employerKey('Smith and Sons'));
  // one ad platform account under two spellings
  assert.equal(employerKey('Appcastenterprise'), employerKey('Appcast Enterprise'));
  assert.notEqual(employerKey('Acme Care'), employerKey('Acme Homes'));
  const shard = shardOf('support worker');
  assert.ok(shard >= 0 && shard < 64);
});

test('Reed parser reads a job card', () => {
  const reed = SITES.find((s) => s.id === 'reed');
  const html = `<article data-qa="job-card" data-id="job123">
    <a data-qa="job-card-title" data-id="123" href="/jobs/x/123">Support Worker</a>
    <div data-qa="job-posted-by">Yesterday by <a>Acme Care</a></div>
    <ul data-qa="job-metadata"><li data-qa="job-metadata-location">Leeds</li></ul></article>`;
  const { listFound, jobs } = reed.parse(html, now);
  assert.equal(listFound, true);
  assert.deepEqual(jobs[0], {
    id: '123',
    title: 'Support Worker',
    employer: 'Acme Care',
    location: 'Leeds',
    postedAt: '2026-10-31T10:00:00.000Z',
  });
});

test('Reed reads only jobs added in the last three days', () => {
  const reed = SITES.find((s) => s.id === 'reed');
  assert.equal(reed.pageUrl(2), 'https://www.reed.co.uk/jobs?dateCreatedOffSet=lastthreedays&pageno=2');
  assert.equal(reed.seenPagesToStop, 3);
});

test('Teaching Vacancies parser reads the JSON feed', () => {
  const site = SITES.find((s) => s.id === 'teachingvacancies');
  // two jobs from the live feed (1 Nov 2026), without their advert text
  const sample = readFileSync(new URL('./fixtures/teaching-vacancies.json', import.meta.url), 'utf8');
  const { listFound, jobs, cards } = site.parse(sample, now);
  assert.equal(listFound, true);
  assert.equal(cards, 2);
  assert.deepEqual(jobs[0], {
    id: 'class-teacher-f5bacdfc-e924-477b-a5e0-d0e8102cba11',
    title: 'Class Teacher',
    employer: 'Glebelands Primary Academy',
    location: 'Chatteris',
    postedAt: '2026-11-01T12:00:00.000Z',
  });
  assert.equal(jobs[1].employer, 'Stag Lane Primary School');
  // past the last page the feed has an empty list
  assert.deepEqual(site.parse('{"data":[]}', now), { listFound: true, jobs: [], cards: 0 });
});

test('Work Hub parser skips copied NHS Jobs adverts', () => {
  const workHub = SITES.find((s) => s.id === 'workhub');
  const card = (id, employer) => `<div data-testid="searchResultCard-${id}">
    <a data-testid="jobTitle-${id}" href="/jobs/${id}">Nurse</a>
    <div data-testid="searchResultCardEmployer"><span>${employer}</span><span> - Leeds</span></div>
    <p>Added on 6 Oct 2026</p></div>`;
  const { jobs } = workHub.parse(card('1', 'NHS Jobs') + card('2', 'Leeds Care'), now);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].employer, 'Leeds Care');
  assert.equal(jobs[0].postedAt.slice(0, 10), '2026-10-06');
});

test('a page of only skipped cards still counts as a page of the list', () => {
  const workHub = SITES.find((s) => s.id === 'workhub');
  const html = `<div data-testid="searchResultCard-9">
    <a data-testid="jobTitle-9" href="/jobs/9">Nurse</a>
    <div data-testid="searchResultCardEmployer"><span>NHS Jobs</span><span> - Leeds</span></div></div>`;
  const result = workHub.parse(html, now);
  assert.equal(result.jobs.length, 0);
  assert.equal(result.cards, 1);
  assert.equal(result.listFound, true);
});

test('a page with no job list is reported, not read as empty', () => {
  for (const site of SITES) {
    assert.equal(site.parse('<html><body><h1>Access denied</h1></body></html>', now).listFound, false, site.id);
  }
});
