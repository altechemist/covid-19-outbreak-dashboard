import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dataset = JSON.parse(
  readFileSync(new URL('../covid-19.json', import.meta.url), 'utf8'),
);

class FakeOption {
  constructor(text, value) {
    this.text = text;
    this.value = value;
  }
}

class FakeSelect {
  constructor() {
    this.options = [];
    this.selectedIndex = -1;
    this.listeners = [];
  }
  add(option) {
    this.options.push(option);
  }
  addEventListener(type, fn) {
    this.listeners.push(fn);
  }
  change() {
    this.listeners.forEach((fn) => fn());
  }
}

async function run({ search = '', response } = {}) {
  const select = new FakeSelect();
  const output = { innerHTML: '' };
  const chartWrap = { hidden: true };
  const barWrap = { hidden: true };
  const canvas = { getContext: () => ({}) };
  const charts = [];
  const logs = [];

  const elements = {
    '#country': select,
    '#output': output,
    '#chart-wrap': chartWrap,
    '#chart': canvas,
    '#bar-wrap': barWrap,
    '#bar-chart': canvas,
  };

  globalThis.document = { querySelector: (selector) => elements[selector] };
  globalThis.Option = FakeOption;
  globalThis.location = { search };
  globalThis.fetch = async () =>
    response ?? { ok: true, status: 200, json: async () => dataset };

  globalThis.Chart = class {
    constructor(ctx, config) {
      this.ctx = ctx;
      this.config = config;
      charts.push(this);
    }
    destroy() {}
  };

  const real = { log: console.log, error: console.error };
  console.log = (...a) => logs.push(a.join(' '));
  console.error = (...a) => logs.push(a.join(' '));

  try {
    // Cache-busted so each run gets a fresh module with the stubs in place.
    await import(`../js/app.js?run=${Math.random()}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  } finally {
    console.log = real.log;
    console.error = real.error;
  }

  return { select, output, chartWrap, barWrap, charts, logs };
}

test('loads the dataset, populates the selector and logs each country', async () => {
  const { select, output, logs } = await run();

  assert.equal(select.options.length, 5);
  assert.deepEqual(
    select.options.map((o) => o.text),
    ['China', 'Italy', 'South Korea', 'United States', 'South Africa'],
  );

  assert.equal(select.selectedIndex, 0);
  assert.equal(select.disabled, false);
  assert.match(output.innerHTML, /China/);
  assert.match(output.innerHTML, /2,114/);

  assert.equal(logs.length, 2);
  assert.match(logs[0], /loaded 5 countries/);
  assert.match(logs[1], /\[covid-19\] China \(CN\)/);
  assert.match(logs[1], /active 2,114/);
});

test('?country= preselects and the change event re-renders', async () => {
  const { select, output } = await run({ search: '?country=za' });

  assert.equal(select.selectedIndex, 4);
  assert.match(output.innerHTML, /South Africa/);
  assert.match(output.innerHTML, /1,317/);

  select.selectedIndex = 1;
  select.change();

  assert.match(output.innerHTML, /Italy/);
  assert.match(output.innerHTML, /105,792/);
});

test('a failed fetch shows an error rather than a blank page', async () => {
  const { output, logs } = await run({
    response: { ok: false, status: 404, statusText: 'Not Found' },
  });

  assert.match(output.innerHTML, /Couldn't load covid-19\.json/);
  assert.match(logs.at(-1), /\[covid-19\]/);
});

test('a malformed dataset is rejected', async () => {
  const { output } = await run({
    response: { ok: true, status: 200, json: async () => ({ nope: true }) },
  });

  assert.match(output.innerHTML, /doesn't look like the expected dataset/);
});

test('both charts are drawn for the selected country and redrawn on change', async () => {
  const { select, chartWrap, barWrap, charts } = await run();

  assert.equal(chartWrap.hidden, false, 'line chart section revealed');
  assert.equal(barWrap.hidden, false, 'bar chart section revealed');
  assert.equal(charts.length, 2, 'line chart then bar chart');

  assert.equal(charts[0].config.type, 'line');
  assert.equal(charts[0].config.data.datasets.length, 3);
  assert.equal(charts[0].config.options.animation, false);
  assert.equal(charts[0].config.data.datasets[0].data.at(-1).y, 81554);

  assert.equal(charts[1].config.type, 'bar');
  assert.equal(charts[1].config.data.datasets.length, 3);
  assert.equal(charts[1].config.data.datasets[0].data.at(-1).y, 138 / 11);
  assert.equal(charts[1].config.data.datasets[0].data.length, 6);

  select.selectedIndex = 1;
  select.change();

  assert.equal(charts.length, 4, 'both charts redraw on change');
  assert.equal(charts[2].config.type, 'line');
  assert.equal(charts[2].config.data.datasets[0].data.at(-1).y, 105792);
  assert.equal(charts[3].config.type, 'bar');
  assert.equal(charts[3].config.data.datasets[0].data.at(-1).y, 58771 / 11);
});

test('the metric cards show the four headline figures', async () => {
  const { output } = await run({ search: '?country=za' });

  assert.match(output.innerHTML, /class="metric confirmed"/);
  assert.match(output.innerHTML, /class="metric deaths"/);
  assert.match(output.innerHTML, /class="metric recovered"/);
  assert.match(output.innerHTML, /class="metric active"/);
  assert.match(output.innerHTML, /1,353/, 'latest confirmed');
  assert.match(output.innerHTML, /1,317/, 'active = confirmed - deaths - recovered');
  assert.match(output.innerHTML, /5 points, 5 Mar 2020 to 31 Mar 2020/);
});

test('the charts stay hidden when loading fails', async () => {
  const { chartWrap, barWrap, charts } = await run({
    response: { ok: false, status: 404, statusText: 'Not Found' },
  });

  assert.equal(chartWrap.hidden, true);
  assert.equal(barWrap.hidden, true);
  assert.equal(charts.length, 0);
});
