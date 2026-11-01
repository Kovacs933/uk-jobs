// Polite page downloader: one request at a time per site, retries on network errors and 5xx,
// and gives up on a site that blocks us (403) or keeps rate limiting us (429), like Foundation does.

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const TIMEOUT_MS = 30_000;
const ATTEMPTS = 4;

export class BlockedError extends Error {}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchPage(url) {
  let lastError;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': UA, 'accept-language': 'en-GB,en;q=0.9', accept: 'text/html,application/xhtml+xml' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 403) throw new BlockedError(`blocked (403) at ${url}`);
      if (res.status === 429) {
        if (attempt === ATTEMPTS) throw new BlockedError(`rate limited (429) at ${url}`);
        await sleep(30_000 * attempt);
        continue;
      }
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      if (/<title>\s*just a moment/i.test(html)) throw new BlockedError(`bot check page at ${url}`);
      return html;
    } catch (error) {
      if (error instanceof BlockedError) throw error;
      lastError = error;
      await sleep(2_000 * attempt * attempt);
    }
  }
  throw new Error(`failed after ${ATTEMPTS} attempts: ${lastError?.message} (${url})`);
}
