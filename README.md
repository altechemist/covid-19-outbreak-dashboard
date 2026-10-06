# COVID-19 Early Outbreak Dashboard

Dashboard for the early COVID-19 outbreak period (February–March 2020), built
around the supplied `covid-19.json` snapshot.

## Running it

The page fetches the JSON at runtime, so it has to be served over HTTP —
opening `index.html` straight off the filesystem will fail on CORS.

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Any static server works the same way
(`npx serve`, `php -S`, nginx).

Add `?country=IT` to the URL to preselect a country, e.g.
<http://localhost:8000/?country=ZA>.

`?sync=1` makes the page fetch the JSON synchronously. It exists only for the
screenshot script — see below — and nothing in normal use needs it.

## The data

`covid-19.json` comes from the Johns Hopkins CSSE COVID-19 repository, covering
2020-02-01 to 2020-03-31. Two things about it are worth knowing before reading
any numbers off the dashboard:

**The series are snapshots, not daily.** Each country has 5–7 rows spaced
roughly 10 days apart, and the gaps differ between countries (Italy's are 5–11
days, South Africa's last gap is 4). Daily figures cannot be recovered from
this — only the change between two reports. The line chart plots the reported
dates as they are, with no invented spacing in between.

**Countries do not all start on the same date.** Italy first appears on
20 Feb, South Africa on 5 Mar, the others on 1 Feb. Gaps before a country's
first row are missing data, not zero cases.

### Known data issues

The supplied figures don't all match what JHU CSSE published. For the
United States on 2020-03-31 this file has `deaths: 3873` and
`recovered: 7024`, where JHU reported 5060 and roughly 75000. The recovered
figure in particular inflates the derived active case count for the US, since
active cases are confirmed − deaths − recovered. The files were left as
supplied rather than corrected.

## Charts

**Chart.js, vendored.** The brief allows Chart.js, D3, Plotly or ApexCharts.
Chart.js was picked because it needs no build step and one file covers
everything here. It is vendored rather than loaded from a CDN so the dashboard
still works offline — someone opening this a year from now should not depend on
jsdelivr.

The vendored file ends in a `sourceMappingURL=chart.umd.js.map` comment. The map
isn't included (~400KB), so that only produces a 404 when devtools are open.

**Dates sit on a linear axis of epoch values, not a category axis.** Category
spacing would spread the 5–7 reports evenly even though the real gaps run 4–19
days apart, which misrepresents how fast things moved — Italy's February growth
would look like it started earlier than it did. Epoch milliseconds with a
formatted tick callback keep true spacing without pulling in a date-adapter
package. Ticks step by exactly one week from the first report, so they land on
real dates.

**`animation: false`**, so a capture taken at the load event sees the finished
chart rather than frame zero. The x axis sets `min`/`max` explicitly too —
Chart.js linear axes default to `min: 0`, which would push every point against
the right-hand edge.

**One y axis, starting at zero.** Deaths and recovered sit far below confirmed
(5 against 1,353 for South Africa), so those two lines hug the bottom of the
plot. Values remain readable on hover. A secondary or logarithmic axis would
show them more clearly but is easier to misread, and the brief does not ask for
it.

## Layout

```
index.html               page shell
css/styles.css
js/data.js               data normalisation, no DOM
js/charts.js             chart config builder, no DOM
js/app.js                loading, selector, logging, drawing
vendor/chart.umd.js      Chart.js 4.4.1, vendored
tests/calc.test.mjs      data tests
tests/charts.test.mjs    chart config tests
tests/app.test.mjs       loading and rendering tests
scripts/screenshot.sh
screenshots/
```

## Tests

```sh
node --test tests/calc.test.mjs tests/charts.test.mjs tests/app.test.mjs
```

`calc` covers the data layer against the real dataset. `charts` checks the chart
config — datasets, points, axis bounds, tick dates, animation — with no DOM
involved. `app` runs `app.js` against a small DOM stub, covering the load →
selector → chart path and both error paths.

## Screenshots

```sh
scripts/screenshot.sh IT 1440 900
```

Serves the page, captures it with headless Firefox, and writes
`screenshots/dashboard-<country>-<w>x<h>.png`. Takes country, width and height.

Headless Firefox captures at the page's `load` event, which happens before an
async `fetch()` has resolved — so a naive capture shows the loading placeholder
instead of the data. `?sync=1` blocks on the fetch and `animation: false` keeps
the chart from mid-draw, so both finish first. That closes the gap most of the
time but not always, so every capture is checked and retried rather than
trusted. The check requires the muted summary line **and** one colour per chart
series to be present; a capture with the text but no chart is rejected too.

Thresholds are exact-match pixel counts set from measurement: the lowest series
count seen across all five countries and both window sizes is 634, and the gate
is 200, so it tolerates variation while reading zero when nothing drew.

If Pillow isn't installed the check is skipped and the capture is written
unverified, so the script still works without it.
