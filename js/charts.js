// Builds a complete Chart.js config without referring to Chart itself, so the
// shape and the numbers can be tested in Node with no DOM.
import { series, dailyNewCases } from './data.js';

export const SERIES = [
  { key: 'confirmed', label: 'Confirmed', color: '#1f6feb' },
  { key: 'deaths', label: 'Deaths', color: '#b02a1f' },
  { key: 'recovered', label: 'Recovered', color: '#0f766e' },
];

export const WEEK = 7 * 24 * 60 * 60 * 1000;

const DAY = 24 * 60 * 60 * 1000;

export function epoch(date) {
  return Date.parse(`${date}T00:00:00Z`);
}

const day = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

const fullDay = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const count = new Intl.NumberFormat('en-US');
const compact = new Intl.NumberFormat('en-US', { notation: 'compact' });
// Averages land on fractions — Italy recovers 0.2/day — so one decimal keeps a
// small rate from rounding away to zero.
const perDay = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

export function formatDate(epochMs) {
  return day.format(new Date(epochMs));
}

export function formatTooltipDate(epochMs) {
  return fullDay.format(new Date(epochMs));
}

// Shared by both charts so their date axes line up exactly: same span, same
// weekly ticks, same labels. A linear scale defaults to min 0 — 1970 — which
// would squash every point into the right-hand edge of the plot.
function dateScale(rows) {
  const x = rows.map((row) => epoch(row.date));
  let min = rows.length ? x[0] : 0;
  let max = rows.length ? x[x.length - 1] : 1;

  // A filtered range holding a single report would collapse the axis to zero
  // width; padding it a day either side leaves the point somewhere to sit.
  if (min === max && rows.length) {
    min -= DAY;
    max += DAY;
  }

  return {
    type: 'linear',
    min,
    max,
    ticks: {
      // Starting from a midnight-UTC min, whole weeks land on real dates
      // instead of Chart.js's arbitrary numeric steps.
      stepSize: WEEK,
      maxTicksLimit: 12,
      callback: (value) => formatDate(value),
    },
    title: { display: true, text: 'Date' },
  };
}

export function chartConfig(country) {
  const rows = series(country);
  const x = rows.map((row) => epoch(row.date));

  return {
    type: 'line',
    data: {
      datasets: SERIES.map((s) => ({
        label: s.label,
        borderColor: s.color,
        backgroundColor: s.color,
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 5,
        fill: false,
        tension: 0,
        data: rows.map((row, i) => ({ x: x[i], y: row[s.key] })),
      })),
    },
    options: {
      // Captures are taken at the load event, so an animating chart would be
      // frozen at frame 0 with nothing drawn.
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          callbacks: {
            title: (items) => formatTooltipDate(items[0].parsed.x),
            label: (item) => `${item.dataset.label}: ${count.format(item.parsed.y)}`,
          },
        },
      },
      scales: {
        x: dateScale(rows),
        y: {
          beginAtZero: true,
          ticks: { callback: (value) => compact.format(value) },
          title: { display: true, text: 'Cases' },
        },
      },
    },
  };
}

// Bars sit on the same date axis as the line chart, so the two can be read
// against each other. Chart.js groups datasets side by side on a linear axis
// just as it does on a category one, which is what keeps three series per date
// from covering each other.
export function dailyChartConfig(country) {
  const rows = series(country);
  const points = dailyNewCases(country);

  return {
    type: 'bar',
    data: {
      datasets: SERIES.map((s) => ({
        label: s.label,
        backgroundColor: s.color,
        data: points.map((p) => ({ x: epoch(p.date), y: p[s.key] })),
      })),
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          callbacks: {
            // A bar covers an interval rather than a day, so the tooltip names
            // the span and the gap the figure was averaged over.
            title: (items) => {
              const p = points[items[0].dataIndex];
              return `${formatTooltipDate(epoch(p.from))} → ${formatTooltipDate(epoch(p.date))} (${p.days} days)`;
            },
            label: (item) =>
              `${item.dataset.label}: ${perDay.format(item.parsed.y)} per day`,
          },
        },
      },
      scales: {
        x: dateScale(rows),
        y: {
          beginAtZero: true,
          ticks: { callback: (value) => compact.format(value) },
          title: { display: true, text: 'New cases per day' },
        },
      },
    },
  };
}
