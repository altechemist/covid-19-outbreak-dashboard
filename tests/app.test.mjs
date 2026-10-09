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

class FakeInput {
  constructor() {
    this.value = '';
    this.min = '';
    this.max = '';
    this.disabled = true;
    this.listeners = [];
  }
  addEventListener(type, fn) {
    this.listeners.push(fn);
  }
  change() {
    this.listeners.forEach((fn) => fn());
  }
}

function fakeCanvas() {
  return {
    attrs: {},
    getContext: () => ({}),
    setAttribute(key, value) {
      this.attrs[key] = value;
    },
  };
}

async function run({ search = '', response } = {}) {
  const select = new FakeSelect();
  const from = new FakeInput();
  const to = new FakeInput();
  const output = { innerHTML: '' };
  const chartWrap = { hidden: true };
  const barWrap = { hidden: true };
  const lineCanvas = fakeCanvas();
  const barCanvas = fakeCanvas();
  const charts = [];
  const logs = [];

  const elements = {
    '#country': select,
    '#from': from,
    '#to': to,
    '#output': output,
    '#chart-wrap': chartWrap,
    '#chart': lineCanvas,
    '#bar-wrap': barWrap,
    '#bar-chart': barCanvas,
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

  return { select, from, to, output, chartWrap, barWrap, lineCanvas, barCanvas, charts, logs };
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

test('a date range narrows both charts and the metric cards', async () => {
  const { output, charts } = await run({
    search: '?country=za&from=2020-03-01&to=2020-03-20',
  });

  assert.match(output.innerHTML, /3 points, 5 Mar 2020 to 20 Mar 2020/);
  assert.equal(charts[0].config.data.datasets[0].data.length, 3, 'line keeps three reports');
  assert.equal(charts[1].config.data.datasets[0].data.length, 2, 'and two intervals');
});

test('a range with no reports hides the charts and names the dates', async () => {
  const { output, chartWrap, barWrap, charts } = await run({
    search: '?country=za&from=2020-03-06&to=2020-03-09',
  });

  assert.match(output.innerHTML, /no reports between 6 Mar 2020 and 9 Mar 2020/);
  assert.equal(chartWrap.hidden, true);
  assert.equal(barWrap.hidden, true);
  assert.equal(charts.length, 0);
});

test('changing country resets the range to its full span', async () => {
  const { select, from, to, output } = await run({
    search: '?country=za&from=2020-03-10&to=2020-03-20',
  });

  assert.equal(from.value, '2020-03-10');
  assert.equal(to.value, '2020-03-20');

  select.selectedIndex = 1;
  select.change();

  assert.equal(from.value, '2020-02-20');
  assert.equal(to.value, '2020-03-31');
  assert.match(output.innerHTML, /Italy/);
  assert.match(output.innerHTML, /6 points/);
});

test('editing a date redraws the charts, and the range cannot be inverted', async () => {
  const { from, to, output, charts } = await run({ search: '?country=za' });

  from.value = '2020-03-10';
  from.change();

  assert.match(output.innerHTML, /4 points, 10 Mar 2020 to 31 Mar 2020/);
  assert.equal(charts.length, 4, 'both charts redraw');
  assert.equal(charts[2].config.data.datasets[0].data.length, 4);

  from.value = '2020-03-25';
  to.value = '2020-03-10';
  from.change();

  assert.equal(to.value, '2020-03-25', 'the other end is pulled up, not inverted');
});

test('both canvases carry a label naming the country', async () => {
  const { lineCanvas, barCanvas } = await run({ search: '?country=it' });

  assert.match(lineCanvas.attrs['aria-label'], /^Italy:/);
  assert.match(barCanvas.attrs['aria-label'], /^Italy:/);
});
