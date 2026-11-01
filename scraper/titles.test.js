import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTitleGrouper, plainTitleKey } from './lib/titles.js';

// titles seen often enough, from enough employers, to count as known
const KNOWN = [
  'Care Assistant',
  'Registered Nurse',
  'Healthcare Assistant',
  'Staff Nurse',
  'Support Worker',
  'Customer Service Advisor',
  'Barista',
  'Salaried GP',
  'Team Leader',
  'Receptionist',
  'Consultant',
  'Global Asset Manager',
  'Delivery Driver',
  'Senior Care Assistant',
  'PhD Studentship',
];
const postings = KNOWN.flatMap((t) => [
  { t, e: 'Employer A' },
  { t, e: 'Employer B' },
  { t, e: 'Employer A' },
]);
// seen 3 times but from one employer only: not known
postings.push(...Array.from({ length: 3 }, () => ({ t: 'Credit Analyst Generalist', e: 'IG' })));

const group = buildTitleGrouper(postings);
const key = (title, employer = 'Someone Ltd') => group(title, employer).key;

test('repeated titles share a key', () => {
  const cases = [
    // qualifiers at the front, the end or in their own part
    ['Care Assistant - Nights', 'care assistant'],
    ['Care Assistant - Bank', 'care assistant'],
    ['Bank Care Assistant', 'care assistant'],
    ['Nights Care Assistant', 'care assistant'],
    ['Care Assistant (Days)', 'care assistant'],
    ['Care Assistant Days', 'care assistant'],
    ['Weekends Only - Care Assistant', 'care assistant'],
    ['Relief Care Assistant', 'care assistant'],
    ['Care Assistant - Part Time & Full Time', 'care assistant'],
    ['Care Assistant (Days) - 1 Year Fixed Term Contract', 'care assistant'],
    ['Care Assistant - Bank - Care Home', 'care assistant'],
    ['Care Assistant - Female Only', 'care assistant'],
    ['Registered Nurse - Bank', 'registered nurse'],
    ['Bank Registered Nurse Band 5', 'registered nurse'],
    ['Registered Nurse (RMN or RNLD)', 'registered nurse'],
    ['Band 5 Staff Nurse', 'staff nurse'],
    ['Staff Nurse - Albert Ward Male PICU', 'staff nurse'],
    ['Staff Nurse (Band 6) - Children\'s Day Unit', 'staff nurse'],
    ['Locum Salaried GP', 'salaried gp'],
    ['Salaried GP - 12 month', 'salaried gp'],
    ['Salaried GP: 5-8 sessions', 'salaried gp'],
    ['Support Worker (Nights)', 'support worker'],
    ['Support Worker Weekends Only', 'support worker'],
    ['Support Workers', 'support worker'],
    ['Part-Time Support Worker', 'support worker'],
    ['Permanent Support Worker', 'support worker'],
    ['Temporary Support Worker', 'support worker'],
    ['Support Worker Level 3', 'support worker'],
    ['Receptionist - Windmill Practice', 'receptionist'],
    ['Delivery Driver - Leeds', 'delivery driver'],
    // spelling
    ['Health Care Assistant', 'healthcare assistant'],
    ['Health Care Assistants', 'healthcare assistant'],
    ['Healthcare Assistant (HCA)', 'healthcare assistant'],
    ['Team Leader - Children&amp;s Homes', 'team leader'],
    ['care assistant', 'care assistant'],
    ['CARE ASSISTANT', 'care assistant'],
    ['PhD Studentship: Machine Learning for plasmid risk assessment', 'phd studentship'],
  ];
  for (const [title, expected] of cases) assert.equal(key(title), expected, title);
});

test('employer or qualifier before the dash', () => {
  assert.equal(key('Costa Coffee - Barista', 'Costa Coffee Ltd'), 'barista');
  // the first part is not this posting's employer: the whole title stays
  assert.equal(key('Costa Coffee - Barista', 'Starbucks'), 'costa coffee barista');
  assert.equal(key('Weekends Only - Care Assistant'), 'care assistant');
});

test('real differences keep their own row', () => {
  const cases = [
    // level words are never folded away
    ['Senior Care Assistant', 'senior care assistant'],
    ['Senior Care Assistant - Bank', 'senior care assistant'],
    ['Customer Service Advisor - Apprentice', 'customer service advisor apprentice'],
    ['Care Assistant - Team Leader', 'care assistant team leader'],
    ['Support Worker - Deputy Manager', 'support worker deputy manager'],
    ['Staff Nurse - Senior', 'staff nurse senior'],
    ['Registered Nurse - Trainee', 'registered nurse trainee'],
    // a single generic word never takes in what follows
    ['Consultant - Neurology', 'consultant neurology'],
    ['Consultant - EMEA Gas and LNG', 'consultant emea gas and lng'],
    // an unknown first part keeps the whole title
    ['IG Credit Analyst Generalist - Global Asset Manager', 'ig credit analyst generalist global asset manager'],
    ['Credit Analyst Generalist - Global Asset Manager', 'credit analyst generalist global asset manager'],
    // (keys drop a last-word plural, "leeds" included; only the key, not the name shown)
    ['Quantum Widget Wrangler - Leeds', 'quantum widget wrangler leed'],
    // different jobs that share words
    ['Care Assistant Manager', 'care assistant manager'],
    ['Healthcare Assistant Practitioner', 'healthcare assistant practitioner'],
    ['Night Support Worker', 'night support worker'],
    ['Head of Sales', 'head of sales'],
  ];
  for (const [title, expected] of cases) assert.equal(key(title), expected, title);
});

test('the variant keeps what was dropped', () => {
  assert.equal(group('Care Assistant - Nights', 'X').variant, 'Nights');
  assert.equal(group('Bank Care Assistant', 'X').variant, 'Bank');
  assert.equal(group('Staff Nurse - Albert Ward Male PICU', 'X').variant, 'Albert Ward Male PICU');
  assert.equal(group('Care Assistant', 'X').variant, '');
});

test('a title that is only a qualifier still gets a key', () => {
  assert.equal(key('Bank'), 'bank');
  assert.equal(plainTitleKey('Care Assistant - Nights'), 'care assistant');
});
