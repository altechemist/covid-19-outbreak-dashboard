import { summary, findCountry } from './data.js';

const DATA_URL = 'covid-19.json';

// Firefox's --screenshot fires at the load event, which lands before an async
// fetch() has resolved, so headless captures show the loading placeholder.
// Blocking the main thread here holds the load event open until the render is
// done. Only reachable via ?sync=1 — synchronous XHR is deprecated, so normal
// use never goes through it.
const SYNC = new URLSearchParams(location.search).has('sync');

function request() {
  if (!SYNC) return fetch(DATA_URL);

  const xhr = new XMLHttpRequest();
  xhr.open('GET', DATA_URL, false);
  xhr.send(null);

  return {
    ok: xhr.status >= 200 && xhr.status < 300,
    status: xhr.status,
    statusText: xhr.statusText,
    json: async () => JSON.parse(xhr.responseText),
  };
}

const countrySelect = document.querySelector('#country');
const output = document.querySelector('#output');

// en-ZA groups with spaces, which reads ambiguously at six digits ("81 554").
const nf = new Intl.NumberFormat('en-US');

// ISO dates are UTC, so formatting them via a Date is safe from DST shifting
// the day backwards.
function readDate(iso) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`));
}

function describe(country) {
  const s = summary(country);
  if (!s) return `${country.country}: no data`;

  const line =
    `${s.points} points, ${readDate(s.from)} to ${readDate(s.to)} — ` +
    `confirmed ${nf.format(s.confirmed)}, deaths ${nf.format(s.deaths)}, ` +
    `recovered ${nf.format(s.recovered)}, active ${nf.format(s.active)}`;

  console.log(`[covid-19] ${s.country} (${s.code}) — ${line}`);

  return `<h2>${s.country}</h2>
    <p class="meta">${line}</p>`;
}

function render(countries) {
  output.innerHTML = describe(countries[countrySelect.selectedIndex]);

  countrySelect.addEventListener('change', () => {
    output.innerHTML = describe(countries[countrySelect.selectedIndex]);
  });
}

function fail(message) {
  output.innerHTML = `<p class="error">${message}</p>`;
  console.error(`[covid-19] ${message}`);
}

async function load() {
  let data;

  try {
    const response = await request();

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    data = await response.json();
  } catch (err) {
    fail(`Couldn't load ${DATA_URL} — ${err.message}. Is the page being served over HTTP?`);
    return;
  }

  if (!Array.isArray(data?.countries) || data.countries.length === 0) {
    fail(`${DATA_URL} doesn't look like the expected dataset (no countries array).`);
    return;
  }

  console.log(`[covid-19] loaded ${data.countries.length} countries`);

  for (const country of data.countries) {
    const option = new Option(country.country, country.code);
    countrySelect.add(option);
  }

  const preselected = findCountry(
    data.countries,
    new URLSearchParams(location.search).get('country'),
  );

  countrySelect.disabled = false;

  countrySelect.selectedIndex = preselected
    ? data.countries.indexOf(preselected)
    : 0;

  render(data.countries);
}

load();
