// Builds a complete Chart.js config without referring to Chart itself, so the
// shape and the numbers can be tested in Node with no DOM.
import { series } from './data.js';

export const SERIES = [
  { key: 'confirmed', label: 'Confirmed', color: '#1f6feb' },
  { key: 'deaths', label: 'Deaths', color: '#b02a1f' },
  { key: 'recovered', label: 'Recovered', color: '#0f766e' },
];

export const WEEK = 7 * 24 * 60 * 60 * 1000;

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

export function formatDate(epochMs) {
  return day.format(new Date(epochMs));
}

export function formatTooltipDate(epochMs) {
  return fullDay.format(new Date(epochMs));
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
        x: {
          type: 'linear',
          // A linear scale defaults to min 0 — 1970 — which would squash every
          // point into the right-hand edge of the plot.
          min: rows.length ? x[0] : 0,
          max: rows.length ? x[x.length - 1] : 1,
          ticks: {
            // Starting from a midnight-UTC min, whole weeks land on real dates
            // instead of Chart.js's arbitrary numeric steps.
            stepSize: WEEK,
            maxTicksLimit: 12,
            callback: (value) => formatDate(value),
          },
          title: { display: true, text: 'Date' },
        },
        y: {
          beginAtZero: true,
          ticks: { callback: (value) => compact.format(value) },
          title: { display: true, text: 'Cases' },
        },
      },
    },
  };
}
