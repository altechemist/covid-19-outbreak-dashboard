// Normalises the supplied snapshots into a shape the rest of the app can treat
// uniformly: rows oldest to newest, numbers coerced so a partial row can't
// render as NaN, and active cases derived.

// A row with no readable date can't be placed on the timeline or paired into an
// interval, and comparing it would throw out of the sort, so it is dropped here
// — the one place every reader of the data goes through.
function dated(row) {
  return typeof row?.date === 'string' && !Number.isNaN(Date.parse(row.date));
}

export function series(country) {
  return (country?.data ?? [])
    .filter(dated)
    .map((row) => ({
      date: row.date,
      confirmed: row.confirmed ?? 0,
      deaths: row.deaths ?? 0,
      recovered: row.recovered ?? 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({ ...row, active: row.confirmed - row.deaths - row.recovered }));
}

export function summary(country) {
  const rows = series(country);
  const last = rows[rows.length - 1];

  if (!last) return null;

  return {
    country: country.country,
    code: country.code,
    points: rows.length,
    from: rows[0].date,
    to: last.date,
    confirmed: last.confirmed,
    deaths: last.deaths,
    recovered: last.recovered,
    active: last.active,
  };
}

const DAY = 24 * 60 * 60 * 1000;

// The dataset holds snapshots 4–19 days apart, not daily counts, so "new cases
// per day" can only be the change between two reports divided by the days
// between them. One entry per interval; the first report has no predecessor and
// so produces no entry.
export function dailyNewCases(country) {
  const rows = series(country);

  return rows.slice(1).flatMap((row, i) => {
    const prev = rows[i];
    const days = Math.round((Date.parse(row.date) - Date.parse(prev.date)) / DAY);

    // Two rows sharing a date would divide by zero. That is a broken snapshot
    // rather than an interval, so it produces no entry at all.
    if (days < 1) return [];

    const rate = (key) => (row[key] - prev[key]) / days;

    return [{
      date: row.date,
      from: prev.date,
      days,
      confirmed: rate('confirmed'),
      deaths: rate('deaths'),
      recovered: rate('recovered'),
    }];
  });
}

export function findCountry(countries, key) {
  if (!key) return null;
  const wanted = String(key).trim().toLowerCase();

  return (
    countries.find((c) => c.code?.toLowerCase() === wanted) ??
    countries.find((c) => c.country?.toLowerCase() === wanted) ??
    null
  );
}
