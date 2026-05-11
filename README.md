# Open Exoplanet Explorer — Observatory Notebook

A static GitHub Pages exoplanet physics notebook for `https://arifsolmaz.github.io/exoplanets/`.

This version is designed to feel less like a glossy app and more like a calm observatory field notebook. It loads a JSON dataset, then derives interpretable exoplanet quantities in the browser: incident flux, habitable-zone placement, density, surface gravity, escape velocity, transit depth, central-transit duration, radial-velocity semi-amplitude, astrometric wobble, and a transmission-spectroscopy signal proxy.

## Main features

- Static GitHub Pages deployment; no frontend build system required.
- Browser-side science notebook with adjustable Bond albedo and atmospheric mean molecular weight.
- Kopparapu-style habitable-zone limits using published polynomial coefficients.
- Transit light-curve and radial-velocity curve visualizations for the selected planet.
- Mass-radius context plot with rocky-composition guide curves.
- Science-oriented filters: optimistic/conservative HZ, rocky-density targets, transit-friendly targets, RV-friendly targets, and atmosphere-friendly targets.
- NASA Exoplanet Archive TAP updater that requests stellar/orbital fields needed for deeper calculations.
- Curated seed dataset so the site works immediately after cloning.

## Repository structure

```text
.
├── index.html
├── assets/
│   ├── css/styles.css
│   ├── js/app.js
│   └── favicon.svg
├── data/exoplanets.json
├── scripts/fetch_exoplanets.py
├── .github/workflows/deploy-pages.yml
├── .github/workflows/refresh-data.yml
├── README.md
├── CONTRIBUTING.md
├── LICENSE
├── robots.txt
├── sitemap.xml
└── 404.html
```

## Run locally

Use a local web server. Opening `index.html` directly with `file://` can block JSON loading in the browser.

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

## Refresh the exoplanet dataset

```bash
python scripts/fetch_exoplanets.py
```

For a small test extract:

```bash
python scripts/fetch_exoplanets.py --limit 500
```

The script writes `data/exoplanets.json` using NASA Exoplanet Archive TAP output from `pscomppars`.

## Deploy to GitHub Pages

For a standalone repository named `exoplanets`:

```bash
git add .
git commit -m "Redesign exoplanet site as observatory notebook"
git push origin main
```

Then in GitHub:

```text
Settings → Pages → Build and deployment → Source → GitHub Actions
```

The included workflows can deploy the static site and refresh the data on a schedule or manually.

## Scientific model notes

This is an educational public-science site, not a peer-reviewed inference pipeline.

The browser uses these simplified relationships when enough archive fields are available:

- Incident flux: `S = L★ / a²` in Earth units.
- Habitable-zone limits: Kopparapu-style fourth-degree flux polynomial, with HZ distance `d = sqrt(L★ / S_eff)`.
- Transit depth: `δ ≈ (Rp / R★)²`, reported in ppm.
- RV semi-amplitude: simplified Keplerian amplitude with edge-on geometry when inclination is unavailable.
- Density: `ρ = ρ⊕ M/R³`.
- Surface gravity: `g = g⊕ M/R²`.
- Transmission proxy: `Δ ≈ 2 N H Rp / R★²`, with `H = kT / μmH g`.

When archive fields are missing, the interface may estimate stellar luminosity, stellar radius, stellar mass, or semi-major axis using simple main-sequence and Keplerian fallbacks. The UI lists those caveats for the selected planet.

## Data attribution

If you use the refreshed NASA archive dataset in research or public analysis, cite the NASA Exoplanet Archive and check the latest archive documentation for required attribution. The static seed dataset is a compact educational starter dataset and should be replaced with the TAP-generated dataset for serious analysis.
