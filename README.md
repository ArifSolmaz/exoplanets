# Open Exoplanet Explorer — Observatory Notebook

A static GitHub Pages exoplanet physics notebook for `https://arifsolmaz.github.io/exoplanets/`.

This version keeps the quieter observatory-notebook design, replaces the weak hand-drawn browser plots with Python-generated scientific SVG figures, and gives the science lab a wide responsive layout so the plots are readable on real browser screens. The site still works as plain static HTML/CSS/JavaScript, while `scripts/generate_science_plots.py` uses NumPy, pandas, and Matplotlib to render the observing diagnostics during local refresh or GitHub Actions deployment.

## Main features

- Static GitHub Pages deployment; no frontend build system required.
- Python/Matplotlib plot generation for target diagnostics and population figures.
- Full-width responsive science figures with full-size SVG links for inspection.
- Browser-side science notebook with adjustable Bond albedo and atmospheric mean molecular weight.
- Kopparapu-style habitable-zone limits using published polynomial coefficients.
- Limb-darkened transit geometry figures for selected targets.
- Keplerian radial-velocity model figures for selected targets.
- Mass-radius context plots with density contours and selected-target highlighting.
- Science-oriented filters: optimistic/conservative HZ, rocky-density targets, transit-friendly targets, RV-friendly targets, and atmosphere-friendly targets.
- NASA Exoplanet Archive TAP updater that requests stellar/orbital fields needed for deeper calculations.
- Curated seed dataset and pre-generated plot assets so the site works immediately after cloning.

## Repository structure

```text
.
├── index.html
├── requirements.txt
├── assets/
│   ├── css/styles.css
│   ├── js/app.js
│   ├── favicon.svg
│   └── plots/
│       ├── manifest.json
│       ├── global/
│       └── targets/
├── data/exoplanets.json
├── scripts/
│   ├── fetch_exoplanets.py
│   ├── generate_science_plots.py
│   └── validate_site.py
├── .github/workflows/
│   ├── deploy-pages.yml
│   └── refresh-data.yml
├── README.md
├── CONTRIBUTING.md
├── CITATION.cff
├── LICENSE
├── robots.txt
├── sitemap.xml
└── 404.html
```

## Run locally

Use a local web server. Opening `index.html` directly with `file://` can block JSON and SVG loading in the browser.

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

## Install Python plotting dependencies

```bash
python -m pip install -r requirements.txt
```

## Regenerate the figures

```bash
python scripts/generate_science_plots.py
```

The script writes:

```text
assets/plots/manifest.json
assets/plots/global/*.svg
assets/plots/targets/<planet-slug>/*.svg
```

By default it generates target-specific figure packs for 16 high-value targets. Increase that locally if you want more selected planets to have Python-rendered plots:

```bash
python scripts/generate_science_plots.py --target-limit 40
```

## Refresh the exoplanet dataset and figures

```bash
python scripts/fetch_exoplanets.py
python scripts/generate_science_plots.py
python scripts/validate_site.py
```

For a small test extract:

```bash
python scripts/fetch_exoplanets.py --limit 500
python scripts/generate_science_plots.py --target-limit 20
```

The data script writes `data/exoplanets.json` using NASA Exoplanet Archive TAP output from `pscomppars`. The plotting script then renders static SVG diagnostics from that JSON.

## Deploy to GitHub Pages

For a standalone repository named `exoplanets`:

```bash
git add -A
git commit -m "Add Python-generated exoplanet science plots"
git push origin main
```

Then in GitHub:

```text
Settings → Pages → Build and deployment → Source → GitHub Actions
```

The included deploy workflow installs the plotting dependencies, regenerates the figures, and deploys the static site. The refresh workflow fetches NASA data, regenerates figures, commits changed data/plots, and deploys.

## Scientific model notes

This is an educational public-science site, not a peer-reviewed inference pipeline.

The browser and Python scripts use these simplified relationships when enough archive fields are available:

- Incident flux: `S = L★ / a²` in Earth units.
- Habitable-zone limits: Kopparapu-style fourth-degree flux polynomial, with HZ distance `d = sqrt(L★ / S_eff)`.
- Transit depth: `δ ≈ (Rp / R★)²`, reported in ppm.
- Transit shape: simple geometric light curve with approximate quadratic limb darkening in the Python figure.
- RV semi-amplitude: simplified Keplerian amplitude with edge-on geometry when inclination is unavailable.
- Density: `ρ = ρ⊕ M/R³`.
- Surface gravity: `g = g⊕ M/R²`.
- Transmission proxy: `Δ ≈ 2 N H Rp / R★²`, with `H = kT / μmH g`.

When archive fields are missing, the interface may estimate stellar luminosity, stellar radius, stellar mass, or semi-major axis using simple main-sequence and Keplerian fallbacks. The UI lists those caveats for the selected planet.

## Data attribution

If you use the refreshed NASA archive dataset in research or public analysis, cite the NASA Exoplanet Archive and check the latest archive documentation for required attribution. The static seed dataset is a compact educational starter dataset and should be replaced with the TAP-generated dataset for serious analysis.
