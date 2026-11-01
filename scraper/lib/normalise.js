// Cleaning job titles and employer names so the same job counts together.
// The front end (site/app.js) has a copy of titleKey and shardOf: keep them in step.

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Tidy a job title for display: drops a salary or the job's own town tacked onto the end
 * ("Nursery Assistant, Basingstoke", "Care Worker - Leeds", "Chef - £14 per hour").
 */
export function cleanTitle(title, location) {
  let t = title.replace(/\s+/g, ' ').trim();
  t = t.replace(/\s*(?:[-–|,(]\s*)?(?:up to\s*)?£.*$/i, '');
  const town = location?.split(',')[0]?.trim();
  if (town && town.length > 2) {
    t = t.replace(new RegExp(`\\s*(?:[-–|,/]\\s*|\\(\\s*|\\s+in\\s+)${escapeRegExp(town)}\\s*\\)?$`, 'i'), '');
  }
  t = t.replace(/[\s\-–|,*!:]+$/, '').replace(/^[\s\-–|,*!:]+/, '');
  return t || title.trim();
}

/** Grouping key for a job title: case, punctuation and spacing don't matter. */
export function titleKey(title) {
  return title.toLowerCase().replace(/[^a-z0-9+#]+/g, ' ').trim();
}

/** Grouping key for an employer: also ignores "Ltd", "Limited", "plc" and the like. */
export function employerKey(name) {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(ltd|limited|plc|llp|inc|uk|the|group)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const SHARDS = 64;

/** Which employer file a title's employers live in (FNV-1a hash of the title key). */
export function shardOf(key) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % SHARDS;
}
