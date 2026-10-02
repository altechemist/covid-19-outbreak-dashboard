// Normalises the supplied snapshots into a shape the rest of the app can treat
// uniformly: rows oldest to newest, numbers coerced so a partial row can't
// render as NaN, and active cases derived.

export function series(country) {
  return (country?.data ?? [])
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

export function findCountry(countries, key) {
  if (!key) return null;
  const wanted = String(key).trim().toLowerCase();

  return (
    countries.find((c) => c.code?.toLowerCase() === wanted) ??
    countries.find((c) => c.country?.toLowerCase() === wanted) ??
    null
  );
}
