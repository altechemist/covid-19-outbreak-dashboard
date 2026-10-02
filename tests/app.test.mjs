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
  const logs = [];

  globalThis.document = {
    querySelector: (selector) => (selector === '#country' ? select : output),
  };
  globalThis.Option = FakeOption;
  globalThis.location = { search };
  globalThis.fetch = async () =>
    response ?? { ok: true, status: 200, json: async () => dataset };

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

  return { select, output, logs };
}

test('loads the dataset, populates the selector and logs each country', async () => {
  const { select, output, logs } = await run();

  assert.equal(select.options.length, 5);
  assert.deepEqual(
    select.options.map((o) => o.text),
    ['China', 'Italy', 'South Korea', 'United States', 'South Africa'],
  );

  assert.equal(select.selectedIndex, 0);
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
