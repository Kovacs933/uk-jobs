// Where the site reads its data from. The daily GitHub run commits fresh data to the repo, and the
// live site reads it straight from GitHub, so Netlify doesn't need to redeploy every day.
// Locally (tools/serve.js) the data folder next to the site is used instead.
window.DATA_BASE = ['localhost', '127.0.0.1'].includes(location.hostname)
  ? '/site-data/'
  : 'https://raw.githubusercontent.com/Kovacs933/uk-jobs/main/site-data/';
