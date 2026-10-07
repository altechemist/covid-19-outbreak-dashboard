import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { series } from '../js/data.js';
import {
  SERIES,
  WEEK,
  chartConfig,
  dailyChartConfig,
  epoch,
  formatDate,
  formatTooltipDate,
} from '../js/charts.js';

const data = JSON.parse(
  readFileSync(new URL('../covid-19.json', import.meta.url), 'utf8'),
);
const at = (name) => data.countries.find((c) => c.country === name);

test('there is one dataset per series, in order', () => {
  const { data: { datasets } } = chartConfig(at('Italy'));

  assert.equal(datasets.length, 3);
  assert.deepEqual(
    datasets.map((d) => d.label),
    ['Confirmed', 'Deaths', 'Recovered'],
  );
  assert.deepEqual(datasets.map((d) => d.borderColor), SERIES.map((s) => s.color));
});

test('x values are dates and y values match the data layer', () => {
  const rows = series(at('Italy'));
  const datasets = chartConfig(at('Italy')).data.datasets;

  for (const seriesDef of SERIES) {
    const dataset = datasets.find((d) => d.label === seriesDef.label);

    assert.deepEqual(
      dataset.data.map((p) => p.x),
      rows.map((r) => epoch(r.date)),
      `${seriesDef.label} x values`,
    );
    assert.deepEqual(
      dataset.data.map((p) => p.y),
      rows.map((r) => r[seriesDef.key]),
      `${seriesDef.label} y values`,
    );
  }
});

test('every series carries the same number of points', () => {
  const datasets = chartConfig(at('China')).data.datasets;
  const lengths = datasets.map((d) => d.data.length);

  assert.equal(new Set(lengths).size, 1);
  assert.equal(lengths[0], 7);
});

test('the x axis spans the data and does not start at 1970', () => {
  const rows = series(at('United States'));
  const { scales: { x } } = chartConfig(at('United States')).options;

  assert.equal(x.min, epoch(rows[0].date));
  assert.equal(x.max, epoch(rows[rows.length - 1].date));
  assert.ok(x.min > 0, 'min must not fall back to the linear default of 0');
  assert.ok(x.max > x.min);
});

test('animation is off so a capture at the load event shows the finished chart', () => {
  const { options } = chartConfig(at('China'));

  assert.equal(options.animation, false);
  assert.equal(options.maintainAspectRatio, false);
  assert.equal(options.scales.y.beginAtZero, true);
  assert.equal(options.scales.x.ticks.stepSize, WEEK);
});

test('weekly ticks from the first report land on distinct real dates', () => {
  const rows = series(at('China'));
  const ticks = Array.from(
    { length: Math.ceil((epoch(rows[rows.length - 1].date) - epoch(rows[0].date)) / WEEK) + 1 },
    (_, i) => epoch(rows[0].date) + i * WEEK,
  );

  assert.ok(ticks.length > 1);
  assert.equal(new Set(ticks.map((t) => formatDate(t))).size, ticks.length);

  // Axis labels drop the year: the window is a single six-week stretch.
  assert.equal(formatDate(epoch('2020-02-01')), '1 Feb');

  // 2020 is a leap year, so the fourth week lands on 29 February.
  assert.equal(formatDate(epoch(rows[0].date) + 4 * WEEK), '29 Feb');
  assert.equal(formatTooltipDate(epoch(rows[0].date) + 4 * WEEK), '29 Feb 2020');
});

test('a country with no rows still yields a usable config', () => {
  const { data: { datasets }, options } = chartConfig({ country: 'Nowhere', data: [] });

  assert.equal(datasets.length, 3);
  assert.ok(datasets.every((d) => d.data.length === 0));
  assert.equal(options.scales.x.min, 0);
  assert.equal(options.scales.x.max, 1);
});

test('the daily chart is a bar chart of one point per interval', () => {
  const { type, data: { datasets }, options } = dailyChartConfig(at('Italy'));

  assert.equal(type, 'bar');
  assert.deepEqual(datasets.map((d) => d.label), ['Confirmed', 'Deaths', 'Recovered']);
  assert.deepEqual(datasets.map((d) => d.backgroundColor), SERIES.map((s) => s.color));
  assert.ok(datasets.every((d) => d.data.length === 5), 'Italy reports six times, so five intervals');
  assert.equal(datasets[0].data.at(-1).y, 58771 / 11);
  assert.equal(datasets[1].data.at(-1).y, 8396 / 11);
  assert.equal(options.animation, false);
  assert.equal(options.scales.y.beginAtZero, true);
  assert.equal(options.scales.y.title.text, 'New cases per day');
});

test('bars share the line chart date axis so the two can be compared', () => {
  const line = chartConfig(at('Italy'));
  const bar = dailyChartConfig(at('Italy'));

  assert.deepEqual(
    { min: bar.options.scales.x.min, max: bar.options.scales.x.max },
    { min: line.options.scales.x.min, max: line.options.scales.x.max },
  );
  assert.equal(bar.options.scales.x.ticks.stepSize, WEEK);
  assert.equal(bar.data.datasets[0].data[0].x, epoch('2020-02-25'));
});

test('the first report has no bar, because there is nothing before it', () => {
  const southAfrica = dailyChartConfig(at('South Africa'));
  const nowhere = dailyChartConfig({ country: 'Nowhere', data: [] });

  assert.ok(southAfrica.data.datasets.every((d) => d.data.length === 4));
  assert.equal(southAfrica.data.datasets[0].data[0].x, epoch('2020-03-10'));
  assert.ok(nowhere.data.datasets.every((d) => d.data.length === 0));
});

test('bar tooltips name the interval and the rate, not a single day', () => {
  const { options } = dailyChartConfig(at('Italy'));
  const { title, label } = options.plugins.tooltip.callbacks;

  assert.equal(title([{ dataIndex: 4 }]), '20 Mar 2020 → 31 Mar 2020 (11 days)');
  assert.equal(title([{ dataIndex: 0 }]), '20 Feb 2020 → 25 Feb 2020 (5 days)');
  assert.equal(
    label({ dataset: { label: 'Confirmed' }, parsed: { y: 58771 / 11 } }),
    'Confirmed: 5,342.8 per day',
  );
  // Small averages must not round away to zero.
  assert.equal(
    label({ dataset: { label: 'Recovered' }, parsed: { y: 0.2 } }),
    'Recovered: 0.2 per day',
  );
});
