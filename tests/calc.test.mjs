import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { series, summary, findCountry } from '../js/data.js';

const data = JSON.parse(
  readFileSync(new URL('../covid-19.json', import.meta.url), 'utf8'),
);

const at = (name) => data.countries.find((c) => c.country === name);

test('rows come back oldest first even when the file is not', () => {
  const rows = series({ data: [
    { date: '2020-03-01', confirmed: 3 },
    { date: '2020-02-01', confirmed: 1 },
    { date: '2020-02-15', confirmed: 2 },
  ] });

  assert.deepEqual(rows.map((r) => r.date), [
    '2020-02-01',
    '2020-02-15',
    '2020-03-01',
  ]);
});

test('a partial row still produces a usable active count', () => {
  const [row] = series({ data: [{ date: '2020-03-01', confirmed: 100, deaths: 10 }] });

  assert.equal(row.recovered, 0);
  assert.equal(row.active, 90);
});

test('active cases are confirmed minus deaths minus recovered', () => {
  assert.equal(summary(at('China')).active, 2114);
  assert.equal(summary(at('Italy')).active, 77635);
  assert.equal(summary(at('South Africa')).active, 1317);
});

test('summary reports the full date span and latest figures', () => {
  const italy = summary(at('Italy'));

  assert.equal(italy.points, 6);
  assert.equal(italy.from, '2020-02-20');
  assert.equal(italy.to, '2020-03-31');
  assert.equal(italy.confirmed, 105792);
});

test('South Africa starts on 5 March with its first case', () => {
  const [first] = series(at('South Africa'));

  assert.equal(first.date, '2020-03-05');
  assert.equal(first.confirmed, 1);
});

test('a country with no rows summarises to null', () => {
  assert.equal(summary({ country: 'Nowhere', data: [] }), null);
  assert.deepEqual(series({}), []);
});

test('countries resolve by code or name, case-insensitively', () => {
  assert.equal(findCountry(data.countries, 'za').country, 'South Africa');
  assert.equal(findCountry(data.countries, 'united states').code, 'US');
  assert.equal(findCountry(data.countries, 'nope'), null);
  assert.equal(findCountry(data.countries, ''), null);
});
