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

## Daily new cases

The brief asks for new cases per day, but this file only holds snapshots 4–19
days apart, so no single day's count is in the data. Each bar is therefore the
change between two reports divided by the days between them:

```
new cases per day = (confirmed[n] − confirmed[n−1]) ÷ (date[n] − date[n−1])
```

Italy 20 Mar → 31 Mar: (105,792 − 47,021) ÷ 11 = **5,342.8 per day**.

**Does that match known figures?** Italy's 20 Mar and 31 Mar rows — 47,021 and
105,792 — are exactly the daily totals JHU published for those dates. Across
that same window JHU reported between 4,053 and 6,557 new cases a day, so
5,342.8 sits inside the real range. It is deliberately not the peak: Italy's
worst single day was 6,557 on 21 Mar, and averaging over 11 days flattens peaks
as well as troughs.

What the choice costs:

* **Spikes between two snapshots vanish.** China reported roughly 14,800 new
  cases on 12 February alone, when Hubei widened its case definition. That day
  falls between two rows here, so it never appears — China's tallest bar is
  3,293/day for 10–20 Feb, and that is what "peak in February" means on this
  dashboard.
* **Bars are not equal in length.** South Korea's first bar averages over 19
  days, South Africa's last over 4. That is why the value is a rate rather than
  a count, and the tooltip names the span and the gap so it can't be misread as
  a single day's tally.
* **The first report has no bar**, because there is nothing before it to compare
  to. South Africa's bars start on 10 Mar, though its first case on 5 Mar still
  shows on the line chart and in the coverage line under the metric cards.

The arithmetic is pinned against the real dataset in `tests/calc.test.mjs`.

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

**Two charts, one date axis.** The bar chart reuses the same `dateScale()` as
the line chart, so both share an identical span, weekly ticks and labels and
can be read directly against each other. Its three series sit side by side
because Chart.js's `grouped: true` default offsets datasets on a linear axis
just as it does on a category one — no need to fall back to a category axis and
give up the true spacing the line chart gets right.

**Metric cards** use a light tint of each series colour rather than the colour
itself. The screenshot check counts exact series-colour pixels to tell a drawn
chart from an empty one, and a full-height card border would read as a bar.

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

`calc` covers the data layer against the real dataset: normalisation, active
cases, and the daily-new-cases averages checked against known figures. `charts`
checks both chart configs — datasets, points, axis bounds, tick dates, tooltip
wording, animation — with no DOM involved. `app` runs `app.js` against a small
DOM stub, covering the load → selector → both-charts path and both error paths.

## Screenshots

```sh
scripts/screenshot.sh IT 1440 1400
```

Serves the page, captures it with headless Firefox, and writes
`screenshots/dashboard-<country>-<w>x<h>.png`. Takes country, width and height.
The defaults are 1440×1400 and the tablet capture is 820×1500 — the page grew
once the metric cards and the second chart landed, and both charts have to fit
inside one frame to be evidence of anything.

Headless Firefox captures at the page's `load` event, which happens before an
async `fetch()` has resolved — so a naive capture shows the loading placeholder
instead of the data. `?sync=1` blocks on the fetch and `animation: false` keeps
both charts from mid-draw, so everything finishes first. That closes the gap
most of the time but not always, so every capture is checked and retried rather
than trusted.

The check makes five assertions in one pass over the image. Every threshold is
a measured value, not a guess:

| rejected as | condition | gate | measured |
| --- | --- | --- | --- |
| `nodata` | muted summary line pixels | > 200 | 793–806 |
| `nocolour` | pixels of each series colour | > 400 | 1,268–13,097 |
| `nobar` | longest vertical run of a series colour | ≥ 40 px | 227–246 |
| `noline` | columns holding a 2–20 px run | ≥ 50 | 211–312 |
| `clipped` | page background over the last 5 rows | ≥ 95% | 100% |

The run and column checks are what tell the two charts apart. A 2 px line stroke
never exceeds a **14 px** vertical run while a bar is a solid block hundreds of
pixels tall; conversely a bar's edges are vertical, so only the line produces the
thin diagonal runs counted by `noline`. Reading the series-colour total alone
would prove nothing — legend swatches account for roughly 150 px of each colour
with no plot drawn at all.

**Known limit:** the bar and line checks are independent, so a capture with only
one chart would satisfy its own check; each one exists to catch the other's
absence. The gate still cannot prove the metric cards rendered, which is what
`tests/app.test.mjs` covers.

If Pillow isn't installed the check is skipped and the capture is written
unverified, so the script still works without it.
