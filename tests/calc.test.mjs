import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { series, summary, findCountry, dailyNewCases, withinRange } from '../js/data.js';

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

test('a row without a readable date is dropped rather than crashing the sort', () => {
  const rows = series({ data: [
    { date: '2020-03-01', confirmed: 3 },
    { confirmed: 99 },
    { date: 'not-a-date', confirmed: 50 },
    { date: '2020-02-01', confirmed: 1 },
  ] });

  assert.deepEqual(rows.map((r) => r.date), ['2020-02-01', '2020-03-01']);
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

test('a range keeps only the reports inside it', () => {
  const za = withinRange(at('South Africa'), '2020-03-01', '2020-03-20');

  assert.deepEqual(series(za).map((r) => r.date), [
    '2020-03-05',
    '2020-03-10',
    '2020-03-20',
  ]);
  assert.equal(summary(za).points, 3);
  assert.equal(summary(za).to, '2020-03-20');
});

test('an open range keeps everything and an impossible one keeps nothing', () => {
  assert.equal(series(withinRange(at('Italy'), '', '')).length, 6);
  assert.equal(summary(withinRange(at('South Africa'), '2020-03-06', '2020-03-09')), null);
});

test('countries resolve by code or name, case-insensitively', () => {
  assert.equal(findCountry(data.countries, 'za').country, 'South Africa');
  assert.equal(findCountry(data.countries, 'united states').code, 'US');
  assert.equal(findCountry(data.countries, 'nope'), null);
  assert.equal(findCountry(data.countries, ''), null);
});

test('daily new cases are averaged over the gap between reports', () => {
  const italy = dailyNewCases(at('Italy'));

  assert.equal(italy.length, 5);
  assert.equal(italy[0].date, '2020-02-25');
  assert.equal(italy[0].from, '2020-02-20');
  assert.equal(italy[0].days, 5);
  assert.equal(italy[0].confirmed, 56);
  assert.equal(italy[0].deaths, 1.4);
  assert.equal(italy[4].days, 11);
  assert.equal(italy[4].confirmed, 58771 / 11);
});

test('the leap-year gap from February to March is five days', () => {
  const italy = dailyNewCases(at('Italy'));

  assert.equal(italy[1].date, '2020-03-01');
  assert.equal(italy[1].days, 5);
  assert.equal(italy[1].confirmed, 169);
});

test('China peaks in February rather than March', () => {
  const china = dailyNewCases(at('China'));
  const peak = china.reduce((a, b) => (b.confirmed > a.confirmed ? b : a));

  assert.equal(peak.date, '2020-02-20');
  assert.equal(peak.confirmed, 3293.1);
  assert.equal(china[0].days, 9);
  assert.equal(china[0].confirmed, 28258 / 9);
});

test('gaps of different lengths still give comparable rates', () => {
  const korea = dailyNewCases(at('South Korea'));

  assert.equal(korea.length, 5);
  assert.equal(korea[0].days, 19);
  assert.equal(korea[0].confirmed, 92 / 19);
  assert.equal(korea.at(-1).days, 11);
  assert.equal(korea.at(-1).confirmed, 1134 / 11);
});

test('the first report has no predecessor, so it produces no bar', () => {
  const southAfrica = dailyNewCases(at('South Africa'));

  assert.equal(southAfrica.length, 4);
  assert.equal(southAfrica[0].from, '2020-03-05');
  assert.equal(southAfrica[0].date, '2020-03-10');
  assert.equal(southAfrica[0].confirmed, 6 / 5);
  assert.equal(dailyNewCases({ country: 'Nowhere', data: [] }).length, 0);
});

test('a repeated date yields no interval rather than a divide by zero', () => {
  const rows = dailyNewCases({ country: 'Duplicated', data: [
    { date: '2020-03-01', confirmed: 10 },
    { date: '2020-03-01', confirmed: 12 },
    { date: '2020-03-10', confirmed: 30 },
  ] });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].days, 9);
  assert.equal(rows[0].confirmed, 2);
});

test('a dropped row still leaves a usable interval between its neighbours', () => {
  const rows = dailyNewCases({ country: 'Holey', data: [
    { date: '2020-03-01', confirmed: 10 },
    { confirmed: 20 },
    { date: '2020-03-10', confirmed: 100 },
  ] });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].from, '2020-03-01');
  assert.equal(rows[0].days, 9);
  assert.equal(rows[0].confirmed, 10);
});
