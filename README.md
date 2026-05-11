# Open Exoplanet Explorer

A public, static GitHub Pages website for `https://arifsolmaz.github.io/exoplanets/`.

The project explains exoplanet discovery methods, visualizes a planet catalog, and includes a reproducible NASA Exoplanet Archive data-refresh workflow. It has no frontend build step and no required JavaScript framework.

## What is included

- Responsive static website: `index.html`, `assets/css/styles.css`, `assets/js/app.js`
- Interactive exoplanet explorer with search, filters, sorting, cards, summary stats, and charts
- Seed dataset at `data/exoplanets.json`, so the site works immediately after deployment
- NASA TAP updater: `scripts/fetch_exoplanets.py`
- GitHub Actions workflows:
  - `.github/workflows/deploy-pages.yml`
  - `.github/workflows/refresh-data.yml`
- SEO/publication files: `robots.txt`, `sitemap.xml`, `404.html`, `.nojekyll`

## Deploy option A: separate `exoplanets` repository

Use this option if you want the URL to be:

```text
https://arifsolmaz.github.io/exoplanets/
```

1. Create a new public repository named `exoplanets` under the `arifsolmaz` GitHub account.
2. Copy this repo's files into it.
3. Push to the `main` branch.
4. In GitHub: **Settings → Pages → Build and deployment → Source → GitHub Actions**.
5. Run the `Deploy static site to GitHub Pages` workflow, or push a commit to `main`.

## Deploy option B: copy into the homepage repo

Use this option if you already have a repository named `arifsolmaz.github.io` and want this project as a subfolder.

1. Create a folder named `exoplanets` inside your `arifsolmaz.github.io` repository.
2. Copy these files into that folder.
3. Because all site paths are relative, the page should work at:

```text
https://arifsolmaz.github.io/exoplanets/
```

If you use this option, you probably do not need the included `.github/workflows` files inside the subfolder. Keep them only if you adapt the workflow paths for the parent homepage repository.

## Run locally

Use a local server, because browser `fetch()` calls do not reliably load JSON files from `file://`.

```bash
cd open-exoplanet-explorer
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

## Refresh the dataset from NASA

The bundled dataset is a rounded seed dataset. To replace it with archive-derived records:

```bash
python scripts/fetch_exoplanets.py
```

For a smaller test file:

```bash
python scripts/fetch_exoplanets.py --limit 500
```

The script writes `data/exoplanets.json` using the NASA Exoplanet Archive TAP sync endpoint and the `pscomppars` table.

## GitHub Actions data refresh

The included `refresh-data.yml` workflow:

1. Runs every Monday.
2. Fetches current NASA Exoplanet Archive data.
3. Commits `data/exoplanets.json` if changed.
4. Deploys the static site to GitHub Pages.

For this workflow, set Pages source to **GitHub Actions** in repository settings.

## Repository structure

```text
.
├── index.html
├── 404.html
├── robots.txt
├── sitemap.xml
├── assets/
│   ├── css/styles.css
│   ├── js/app.js
│   └── favicon.svg
├── data/
│   └── exoplanets.json
├── scripts/
│   └── fetch_exoplanets.py
└── .github/workflows/
    ├── deploy-pages.yml
    └── refresh-data.yml
```

## Data fields used by the frontend

Each planet record can contain:

```json
{
  "name": "TRAPPIST-1 e",
  "host": "TRAPPIST-1",
  "method": "Transit",
  "discovery_year": 2017,
  "facility": "Spitzer Space Telescope",
  "radius_earth": 0.92,
  "mass_earth": 0.69,
  "orbital_period_days": 6.1,
  "distance_pc": 12.43,
  "stellar_temp_k": 2566,
  "spectral_type": "M8 V",
  "tag": "Terrestrial",
  "description": "..."
}
```

The frontend also tolerates NASA-like column names such as `pl_name`, `hostname`, `discoverymethod`, `disc_year`, `pl_rade`, and `sy_dist`.

## Customization ideas

- Add notebook exports under a `notebooks/` directory.
- Add a blog section for “planet of the week”.
- Add mission pages for Kepler, K2, TESS, JWST, PLATO, and Roman.
- Add a stronger visual comparison view against Earth, Neptune, Jupiter, and the Solar System.
- Replace the seed descriptions with your own explanatory notes.

## Attribution

When using generated data in research, teaching, or public writing, credit the NASA Exoplanet Archive and consult its citation guidance. This repository’s script keeps the source table and query in the JSON metadata so visitors can inspect the data lineage.

## License

MIT. See `LICENSE`.
