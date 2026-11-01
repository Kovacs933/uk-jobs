// Grouping repeated job titles: "Care Assistant - Nights", "Care Assistant - Bank" and
// "Health Care Assistant" are the same jobs as "Care Assistant" / "Healthcare Assistant".
// The rules are cautious: two rows for one job is better than one row hiding two jobs.
//
//   const group = buildTitleGrouper(postings);
//   group('Care Assistant - Nights', 'Acme Care')  // { key: 'care assistant', variant: 'Nights' }
import { employerKey } from './normalise.js';

// pure qualifiers: dropped from the front or end of a title (or a whole dash/bracket part) and
// shown as a variant. Each is a list of words; a RegExp matches one word.
const QUALIFIERS = [
  ['bank'],
  ['nights', 'only'],
  ['nights'],
  ['days', 'only'],
  ['days'],
  ['weekends', 'only'],
  ['weekend', 'only'],
  ['weekends'],
  ['relief'],
  ['locum'],
  ['part', 'time'],
  ['parttime'],
  ['full', 'time'],
  ['fulltime'],
  ['permanent'],
  ['temporary'],
  ['fixed', 'term'],
  [/^\d+$/, /^months?$/],
  ['band', /^\d+[a-z]?$/],
  ['level', /^\d+$/],
  ['ref', /\d/],
];
const JOINERS = new Set(['and', 'or']);

// a title that is just one of these words names a field, not a job ("Consultant - Neurology",
// "Consultant - EMEA Gas and LNG"), so it never takes in what follows
const GENERIC = new Set(
  `manager director consultant officer engineer assistant administrator analyst advisor adviser executive
  coordinator specialist technician lead head supervisor associate partner developer scientist lecturer
  researcher practitioner therapist controller professor fellow solicitor teacher nurse doctor surgeon
  physician registrar designer architect accountant planner buyer operative worker trainee apprentice
  graduate intern`.split(/\s+/),
);

// a dropped part holding one of these is a different job ("Customer Service Advisor - Apprentice",
// "Care Assistant - Team Leader"), so the title keeps its own row
const LEVELS = new Set(
  `senior lead head principal chief junior deputy trainee apprentice graduate intern placement
  leader manager supervisor director`.split(/\s+/),
);

// last words that look plural but aren't
const NOT_PLURAL = new Set(['sales', 'news', 'series', 'species', 'analytics', 'physics', 'economics', 'logistics', 'statistics', 'mathematics', 'ops', 'devops', 'its']);

const decode = (s) => s.replace(/&amp;/gi, '&').replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"');

// " - ", "|", ":", "(", ")", ",", ";" and brackets; a dash inside a word ("Co-ordinator") isn't a split
const SPLIT = /\s[-–—]\s*|\s*[-–—]\s|[|:(),;[\]]/;

/** A part of a title as words, each with its normalised and original spelling. */
function words(part) {
  const out = [];
  for (const raw of part.match(/[A-Za-z0-9+#&'’]+/g) ?? []) {
    const n = raw === '&' ? 'and' : raw.toLowerCase().replace(/['’]/g, '').replace(/&/g, 'and');
    if (n) out.push({ n, o: raw });
  }
  // two-word spellings of one word
  for (let i = 0; i < out.length - 1; i++) {
    const pair = `${out[i].n} ${out[i + 1].n}`;
    const joined = { 'health care': 'healthcare', 'co ordinator': 'coordinator', 'post doctoral': 'postdoctoral' }[pair];
    if (joined) out.splice(i, 2, { n: joined, o: `${out[i].o} ${out[i + 1].o}` });
  }
  return out;
}

const matches = (pattern, word) => (pattern instanceof RegExp ? pattern.test(word.n) : pattern === word.n);

/** Length of the qualifier at words[at] (reading backwards when `fromEnd`), or 0. */
function qualifierAt(list, at, fromEnd) {
  for (const q of QUALIFIERS) {
    const start = fromEnd ? at - q.length + 1 : at;
    if (start < 0 || start + q.length > list.length) continue;
    if (q.every((p, i) => matches(p, list[start + i]))) return q.length;
  }
  return 0;
}

/** Take qualifiers (and stray "and"/"or") off both ends; returns [kept words, dropped original text]. */
function stripQualifiers(list) {
  const dropped = [];
  let a = 0;
  let b = list.length;
  for (let changed = true; changed && a < b; ) {
    changed = false;
    const front = qualifierAt(list.slice(a, b), 0, false);
    if (front) {
      dropped.push(list.slice(a, a + front).map((w) => w.o).join(' '));
      a += front;
      changed = true;
    } else if (JOINERS.has(list[a].n)) {
      a++;
      changed = true;
    }
    if (a >= b) break;
    const back = qualifierAt(list.slice(a, b), b - a - 1, true);
    if (back) {
      dropped.push(list.slice(b - back, b).map((w) => w.o).join(' '));
      b -= back;
      changed = true;
    } else if (JOINERS.has(list[b - 1].n)) {
      b--;
      changed = true;
    }
  }
  return [list.slice(a, b), dropped];
}

function singular(word) {
  if (word.length <= 3 || NOT_PLURAL.has(word)) return word;
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (/(ss|us|is)$/.test(word)) return word;
  return word.endsWith('s') ? word.slice(0, -1) : word;
}

const keyOf = (list) => list.map((w, i) => (i === list.length - 1 ? singular(w.n) : w.n)).join(' ');

/**
 * A title cut into its parts, with qualifiers removed: [{ key, text, words }], plus the
 * qualifiers' original text.
 */
function analyse(title) {
  const qualifiers = [];
  const parts = [];
  for (const piece of decode(title).split(SPLIT)) {
    const [kept, dropped] = stripQualifiers(words(piece));
    qualifiers.push(...dropped);
    if (kept.length) parts.push({ key: keyOf(kept), text: piece.trim(), words: kept });
  }
  return { parts, qualifiers };
}

/** Grouping key for a title on its own, without the known-title list: the whole title, tidied. */
export function plainTitleKey(title) {
  const { parts } = analyse(title);
  return parts.map((p) => p.key).join(' ');
}

/**
 * Builds group(title, employer) -> { key, variant } from all stored postings. A first part
 * "folds in" what follows only when it is a known title: seen at least 3 times from at least
 * 2 employers, as a whole title or as a first part.
 */
export function buildTitleGrouper(postings) {
  const seen = new Map(); // key -> { n, employers: Set }
  for (const p of postings) {
    const first = analyse(p.t).parts[0];
    if (!first) continue;
    if (!seen.has(first.key)) seen.set(first.key, { n: 0, employers: new Set() });
    const s = seen.get(first.key);
    s.n++;
    if (s.employers.size < 2) s.employers.add(employerKey(p.e ?? ''));
  }
  const known = (key) => {
    const s = seen.get(key);
    return Boolean(s && s.n >= 3 && s.employers.size >= 2);
  };

  return function group(title, employer) {
    const { parts, qualifiers } = analyse(title);
    if (parts.length === 0) return { key: plainTitleKey(title) || title.toLowerCase().trim(), name: title, variant: qualifiers.join(', ') };

    // employer first ("Costa Coffee - Barista"): read the job from the part after it
    if (parts.length > 1 && employer && employerKey(parts[0].text) === employerKey(employer) && known(parts[1].key)) {
      parts.shift();
    }

    const text = (p) => p.words.map((w) => w.o).join(' ');
    const [main, ...rest] = parts;
    const folds =
      rest.length > 0 &&
      known(main.key) &&
      !(main.words.length === 1 && GENERIC.has(main.key)) &&
      !rest.some((p) => p.words.some((w) => LEVELS.has(w.n)));
    // `name` is the kept part as written, for a row with no posting under the bare title
    if (rest.length === 0 || folds) {
      return { key: main.key, name: text(main), variant: [...qualifiers, ...rest.map(text)].join(', ') };
    }
    return { key: parts.map((p) => p.key).join(' '), name: parts.map(text).join(' - '), variant: qualifiers.join(', ') };
  };
}
