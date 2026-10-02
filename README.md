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

## Layout

```
index.html          page shell
css/styles.css
js/data.js          data normalisation, no DOM
js/app.js           loading, country selector, logging
tests/calc.test.mjs data tests
scripts/screenshot.sh
```

## Tests

```sh
node --test tests/
```
