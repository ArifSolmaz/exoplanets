#!/usr/bin/env python3
"""Generate publication-style static figures for Open Exoplanet Explorer.

The website is deployed on GitHub Pages, so Python cannot run on the client at
view time. This script runs locally or inside GitHub Actions after the JSON
catalog is refreshed. It writes SVG figures that the browser can display as
ordinary static assets.
"""

from __future__ import annotations

import argparse
import json
import math
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.ticker import FuncFormatter, LogLocator, NullFormatter

EARTH_DENSITY_G_CM3 = 5.514
EARTH_RADIUS_IN_SOLAR_RADII = 1 / 109.076
SOLAR_RADIUS_AU = 0.00465047
EARTH_RADIUS_AU = 4.26352e-5
SOLAR_TEFF_K = 5778.0
ZERO_ALBEDO_EARTH_TEMP_K = 278.5
KOPPARAPU_TEFF_MIN_K = 2600.0
KOPPARAPU_TEFF_MAX_K = 7200.0

PAPER = "#fffaf0"
PAPER_SOFT = "#f7f0df"
INK = "#1f1b16"
MUTED = "#756a5d"
GRID = "#d9cbb6"
BLUE = "#2f6277"
TERRA = "#a3583c"
SAGE = "#687b5d"
VIOLET = "#6a6387"
GOLD = "#b9792b"
GRAY = "#9b9184"

TARGET_FIGSIZE = (12.8, 7.0)
GLOBAL_FIGSIZE = (13.4, 7.1)
PLACEHOLDER_FIGSIZE = (11.2, 6.0)

# Kopparapu et al. HZ polynomial coefficients, same coefficient set used by
# the browser-side calculations. T = T_eff - 5780 K.
HZ_LIMITS = {
    "recent_venus": ("Recent Venus", (1.776, 2.136e-4, 2.533e-8, -1.332e-11, -3.097e-15)),
    "runaway_greenhouse": ("Runaway greenhouse", (1.107, 1.332e-4, 1.580e-8, -8.308e-12, -1.931e-15)),
    "maximum_greenhouse": ("Maximum greenhouse", (0.356, 6.171e-5, 1.698e-9, -3.198e-12, -5.575e-16)),
    "early_mars": ("Early Mars", (0.320, 5.547e-5, 1.526e-9, -2.874e-12, -5.011e-16)),
}

PRIORITY_TARGETS = [
    "TRAPPIST-1 e",
    "TRAPPIST-1 f",
    "Proxima Centauri b",
    "Kepler-186 f",
    "TOI-700 d",
    "K2-18 b",
    "LHS 1140 b",
    "GJ 486 b",
    "55 Cancri e",
    "GJ 1214 b",
    "HD 209458 b",
    "WASP-39 b",
    "WASP-12 b",
    "51 Pegasi b",
]


@dataclass(frozen=True)
class Planet:
    name: str
    host: str | None
    method: str | None
    discovery_year: float | None
    radius_earth: float | None
    mass_earth: float | None
    orbital_period_days: float | None
    distance_pc: float | None
    stellar_temp_k: float | None
    stellar_radius_solar: float | None
    stellar_mass_solar: float | None
    stellar_luminosity_solar: float | None
    semi_major_axis_au: float | None
    eccentricity: float
    inclination_deg: float | None
    insolation_earth: float | None
    density_g_cm3: float | None


def as_number(value: Any) -> float | None:
    if value is None or value == "" or value == "NaN" or value == "nan":
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(numeric):
        return None
    return numeric


def first_number(row: dict[str, Any], *keys: str) -> float | None:
    for key in keys:
        value = as_number(row.get(key))
        if value is not None:
            return value
    return None


def positive(value: float | None) -> bool:
    return value is not None and math.isfinite(value) and value > 0


def luminosity_from_temperature(teff: float | None) -> float | None:
    if not positive(teff):
        return None
    # Deliberately simple main-sequence fallback used only when archive fields
    # are missing. The UI labels these values as estimates.
    ratio = teff / SOLAR_TEFF_K
    return min(2000.0, max(0.0002, ratio**8))


def mass_from_luminosity(luminosity: float | None) -> float | None:
    if not positive(luminosity):
        return None
    if luminosity < 0.033:
        return (luminosity / 0.23) ** (1 / 2.3)
    if luminosity < 16:
        return luminosity ** 0.25
    return (luminosity / 1.5) ** (1 / 3.5)


def radius_from_luminosity_temperature(luminosity: float | None, teff: float | None) -> float | None:
    if not positive(luminosity) or not positive(teff):
        return None
    return math.sqrt(luminosity) / (teff / SOLAR_TEFF_K) ** 2


def semi_major_from_period(period_days: float | None, stellar_mass_solar: float | None) -> float | None:
    if not positive(period_days) or not positive(stellar_mass_solar):
        return None
    return (stellar_mass_solar * (period_days / 365.25) ** 2) ** (1 / 3)


def normalize_planet(row: dict[str, Any]) -> Planet | None:
    name = str(row.get("name") or row.get("pl_name") or "").strip()
    if not name:
        return None

    st_lum_log = first_number(row, "stellar_luminosity_log_solar", "st_lum")
    raw_luminosity = first_number(row, "stellar_luminosity_solar", "luminosity_solar")

    # NASA's st_lum field is log10(L/Lsun). Older local snapshots or hand-edited
    # data can accidentally place that logarithmic value in stellar_luminosity_solar.
    # Linear stellar luminosity cannot be zero or negative, so treat non-positive
    # values as missing unless they can be interpreted as a plausible log value.
    luminosity = raw_luminosity
    if not positive(luminosity):
        log_candidate = st_lum_log if st_lum_log is not None else raw_luminosity
        if log_candidate is not None and -10.0 <= log_candidate <= 10.0:
            luminosity = 10**log_candidate
        else:
            luminosity = None

    stellar_temp = first_number(row, "stellar_temp_k", "st_teff")
    if not positive(luminosity):
        luminosity = luminosity_from_temperature(stellar_temp)

    stellar_radius = first_number(row, "stellar_radius_solar", "st_rad")
    if stellar_radius is None:
        stellar_radius = radius_from_luminosity_temperature(luminosity, stellar_temp)

    stellar_mass = first_number(row, "stellar_mass_solar", "st_mass")
    if stellar_mass is None:
        stellar_mass = mass_from_luminosity(luminosity)

    period = first_number(row, "orbital_period_days", "pl_orbper")
    semi_major = first_number(row, "semi_major_axis_au", "pl_orbsmax")
    if semi_major is None:
        semi_major = semi_major_from_period(period, stellar_mass)

    insolation = first_number(row, "insolation_earth", "pl_insol")
    if insolation is None and positive(luminosity) and positive(semi_major):
        insolation = luminosity / semi_major**2

    density = first_number(row, "density_g_cm3", "pl_dens")
    radius = first_number(row, "radius_earth", "pl_rade")
    mass = first_number(row, "mass_earth", "pl_bmasse", "pl_masse")
    if density is None and positive(radius) and positive(mass):
        density = EARTH_DENSITY_G_CM3 * mass / radius**3

    ecc = first_number(row, "eccentricity", "pl_orbeccen")
    if ecc is None:
        ecc = 0.0
    ecc = min(0.95, max(0.0, ecc))

    return Planet(
        name=name,
        host=str(row.get("host") or row.get("hostname") or "").strip() or None,
        method=str(row.get("method") or row.get("discoverymethod") or "").strip() or None,
        discovery_year=first_number(row, "discovery_year", "disc_year"),
        radius_earth=radius,
        mass_earth=mass,
        orbital_period_days=period,
        distance_pc=first_number(row, "distance_pc", "sy_dist"),
        stellar_temp_k=stellar_temp,
        stellar_radius_solar=stellar_radius,
        stellar_mass_solar=stellar_mass,
        stellar_luminosity_solar=luminosity,
        semi_major_axis_au=semi_major,
        eccentricity=ecc,
        inclination_deg=first_number(row, "inclination_deg", "pl_orbincl"),
        insolation_earth=insolation,
        density_g_cm3=density,
    )


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "planet"


def seff(limit_key: str, stellar_temp_k: float | None) -> float | None:
    _, coeffs = HZ_LIMITS[limit_key]
    teff = stellar_temp_k if positive(stellar_temp_k) else 5780.0
    tstar = teff - 5780.0
    s0, a, b, c, d = coeffs
    value = s0 + a * tstar + b * tstar**2 + c * tstar**3 + d * tstar**4
    if not math.isfinite(value) or value <= 0:
        return None
    return value


def hz_distances(planet: Planet) -> dict[str, float] | None:
    if not positive(planet.stellar_luminosity_solar):
        return None
    lum = planet.stellar_luminosity_solar
    fluxes = {
        "recent_venus": seff("recent_venus", planet.stellar_temp_k),
        "runaway_greenhouse": seff("runaway_greenhouse", planet.stellar_temp_k),
        "maximum_greenhouse": seff("maximum_greenhouse", planet.stellar_temp_k),
        "early_mars": seff("early_mars", planet.stellar_temp_k),
    }
    if any(not positive(value) for value in fluxes.values()):
        return None

    distances = {
        "optimistic_inner": math.sqrt(lum / fluxes["recent_venus"]),
        "conservative_inner": math.sqrt(lum / fluxes["runaway_greenhouse"]),
        "conservative_outer": math.sqrt(lum / fluxes["maximum_greenhouse"]),
        "optimistic_outer": math.sqrt(lum / fluxes["early_mars"]),
    }
    ordered = [
        distances["optimistic_inner"],
        distances["conservative_inner"],
        distances["conservative_outer"],
        distances["optimistic_outer"],
    ]
    if any(not positive(value) for value in ordered):
        return None
    if any(left >= right for left, right in zip(ordered, ordered[1:])):
        return None
    return distances


def transit_depth_ppm(planet: Planet) -> float | None:
    if not positive(planet.radius_earth) or not positive(planet.stellar_radius_solar):
        return None
    k = planet.radius_earth * EARTH_RADIUS_IN_SOLAR_RADII / planet.stellar_radius_solar
    return k**2 * 1_000_000


def impact_parameter(planet: Planet, k: float) -> float:
    if not positive(planet.inclination_deg) or not positive(planet.semi_major_axis_au) or not positive(planet.stellar_radius_solar):
        return 0.0
    rs_au = planet.stellar_radius_solar * SOLAR_RADIUS_AU
    b = planet.semi_major_axis_au * math.cos(math.radians(planet.inclination_deg)) / rs_au
    if not math.isfinite(b) or b < 0 or b > 1 + k:
        return 0.0
    return b


def transit_duration_hours(planet: Planet) -> float | None:
    if not positive(planet.orbital_period_days) or not positive(planet.semi_major_axis_au) or not positive(planet.stellar_radius_solar):
        return None
    k = (planet.radius_earth or 0.0) * EARTH_RADIUS_IN_SOLAR_RADII / planet.stellar_radius_solar if positive(planet.radius_earth) else 0.0
    b = impact_parameter(planet, k)
    rs_au = planet.stellar_radius_solar * SOLAR_RADIUS_AU
    arg = (rs_au / planet.semi_major_axis_au) * math.sqrt(max(0.0, (1 + k) ** 2 - b**2))
    arg = min(1.0, max(0.0, arg))
    return (planet.orbital_period_days / math.pi) * math.asin(arg) * 24.0


def rv_semi_amplitude_ms(planet: Planet) -> float | None:
    if not positive(planet.mass_earth) or not positive(planet.orbital_period_days) or not positive(planet.stellar_mass_solar):
        return None
    sini = math.sin(math.radians(planet.inclination_deg)) if positive(planet.inclination_deg) else 1.0
    return (
        0.08945
        * planet.mass_earth
        * (planet.orbital_period_days / 365.25) ** (-1 / 3)
        * planet.stellar_mass_solar ** (-2 / 3)
        * sini
        / math.sqrt(max(1e-6, 1 - planet.eccentricity**2))
    )


def configure_style() -> None:
    plt.rcParams.update(
        {
            "figure.facecolor": PAPER,
            "axes.facecolor": PAPER,
            "savefig.facecolor": PAPER,
            "savefig.edgecolor": "none",
            "font.family": "DejaVu Serif",
            "font.size": 12,
            "axes.titlesize": 18,
            "axes.labelsize": 13,
            "xtick.labelsize": 11,
            "ytick.labelsize": 11,
            "legend.fontsize": 10.5,
            "axes.labelcolor": INK,
            "axes.edgecolor": "#b9a98f",
            "axes.titlecolor": INK,
            "xtick.color": MUTED,
            "ytick.color": MUTED,
            "grid.color": GRID,
            "grid.alpha": 0.45,
            "grid.linewidth": 0.8,
            "legend.frameon": True,
            "legend.framealpha": 0.92,
            "legend.facecolor": PAPER,
            "legend.edgecolor": "#d4c3aa",
            "svg.fonttype": "none",
        }
    )


def annotate_data_source(ax: plt.Axes, text: str = "model from catalog parameters") -> None:
    ax.text(
        0.99,
        0.02,
        text,
        transform=ax.transAxes,
        ha="right",
        va="bottom",
        fontsize=10.5,
        color=MUTED,
    )


def save(fig: plt.Figure, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        fig.tight_layout(pad=1.15)
    except Exception:
        pass
    fig.savefig(path, format="svg", bbox_inches="tight", pad_inches=0.16)
    plt.close(fig)


def placeholder(path: Path, title: str, message: str) -> None:
    configure_style()
    fig, ax = plt.subplots(figsize=PLACEHOLDER_FIGSIZE)
    ax.axis("off")
    ax.text(0.03, 0.80, title, transform=ax.transAxes, fontsize=19, fontweight="bold", color=INK)
    ax.text(0.03, 0.54, message, transform=ax.transAxes, fontsize=18, color=MUTED, wrap=True)
    ax.text(0.03, 0.20, "Run scripts/fetch_exoplanets.py to pull a richer NASA Archive table.", transform=ax.transAxes, fontsize=14, color=GRAY)
    save(fig, path)


def format_small(value: float | None, digits: int = 3) -> str:
    if not positive(value):
        return "unknown"
    if value >= 1000:
        return f"{value:.0f}"
    if value >= 100:
        return f"{value:.1f}"
    if value >= 10:
        return f"{value:.2f}"
    return f"{value:.{digits}f}"


def plot_habitable_zone(planet: Planet, path: Path) -> None:
    distances = hz_distances(planet)
    if distances is None or not positive(planet.semi_major_axis_au):
        placeholder(path, "Habitable-zone placement", "Stellar luminosity and orbital distance are required for this figure.")
        return

    configure_style()
    fig, ax = plt.subplots(figsize=TARGET_FIGSIZE)

    inner = distances["optimistic_inner"]
    outer = distances["optimistic_outer"]
    cin = distances["conservative_inner"]
    cout = distances["conservative_outer"]
    a = planet.semi_major_axis_au

    x_min = max(0.005, min(inner, a) * 0.45)
    x_max = max(outer, a) * 1.75

    ax.set_xscale("log")
    ax.set_xlim(x_min, x_max)
    ax.set_ylim(0, 1)
    ax.set_yticks([])
    ax.grid(True, axis="x", which="major")
    ax.grid(True, axis="x", which="minor", alpha=0.18)

    ax.axvspan(inner, outer, ymin=0.20, ymax=0.80, color=SAGE, alpha=0.18, label="optimistic HZ")
    ax.axvspan(cin, cout, ymin=0.30, ymax=0.70, color=SAGE, alpha=0.34, label="conservative HZ")
    ax.axvline(a, color=TERRA, lw=2.8, label=f"{planet.name} orbit")
    ax.scatter([a], [0.5], s=145, color=TERRA, edgecolor=INK, linewidth=0.7, zorder=5)
    ax.scatter([x_min * 1.08], [0.5], s=480, color=GOLD, edgecolor="#7b4b18", linewidth=1.0, zorder=4)

    for value, label, y in [(inner, "recent Venus", 0.86), (cin, "runaway", 0.76), (cout, "max greenhouse", 0.76), (outer, "early Mars", 0.86)]:
        ax.axvline(value, color="#7f8d70", lw=1.45, ls="--", alpha=0.65)
        ax.text(value, y, label, rotation=90, va="top", ha="right", fontsize=11.5, color=MUTED)

    ax.set_xlabel("Orbital distance (AU, log scale)")
    ax.set_title(f"Habitable-zone placement — {planet.name}", loc="left", fontsize=18, fontweight="bold", pad=10)
    subtitle = f"L* ≈ {format_small(planet.stellar_luminosity_solar, 3)} Lsun · a ≈ {format_small(a, 4)} AU"
    ax.text(0.015, 0.95, subtitle, transform=ax.transAxes, ha="left", va="top", fontsize=14, color=MUTED, bbox={"boxstyle": "round,pad=0.22", "facecolor": PAPER, "edgecolor": "none", "alpha": 0.88})
    ax.legend(loc="lower center", bbox_to_anchor=(0.5, -0.02), ncol=3, fontsize=10.5)
    annotate_data_source(ax, "Kopparapu-style HZ limits")
    save(fig, path)


def overlap_area_fraction(z: np.ndarray, k: float) -> np.ndarray:
    z = np.asarray(z, dtype=float)
    frac = np.zeros_like(z)
    if k <= 0:
        return frac

    full = z <= abs(1 - k)
    if k < 1:
        frac[full] = k**2
    else:
        frac[full] = 1.0

    partial = (z > abs(1 - k)) & (z < 1 + k)
    zp = np.maximum(z[partial], 1e-12)
    if zp.size:
        term1 = np.arccos(np.clip((zp**2 + 1 - k**2) / (2 * zp), -1, 1))
        term2 = k**2 * np.arccos(np.clip((zp**2 + k**2 - 1) / (2 * zp * k), -1, 1))
        term3 = 0.5 * np.sqrt(np.clip((-zp + 1 + k) * (zp + 1 - k) * (zp - 1 + k) * (zp + 1 + k), 0, None))
        frac[partial] = (term1 + term2 - term3) / math.pi
    return frac


def plot_transit_curve(planet: Planet, path: Path) -> None:
    if not positive(planet.radius_earth) or not positive(planet.stellar_radius_solar):
        placeholder(path, "Transit light curve", "Planet radius and stellar radius are required for a transit-depth figure.")
        return

    k = planet.radius_earth * EARTH_RADIUS_IN_SOLAR_RADII / planet.stellar_radius_solar
    depth = k**2
    duration = transit_duration_hours(planet)
    if not positive(duration):
        # A reasonable visual fallback, explicitly labeled as a geometric model.
        duration = 4.0
    b = impact_parameter(planet, k)
    half = duration / 2
    velocity = math.sqrt(max(1e-9, (1 + k) ** 2 - b**2)) / half
    time_h = np.linspace(-1.45 * duration, 1.45 * duration, 900)
    z = np.sqrt(b**2 + (velocity * time_h) ** 2)
    u1, u2 = 0.35, 0.25
    overlap = overlap_area_fraction(z, k)
    mu = np.sqrt(np.clip(1 - np.minimum(z, 1) ** 2, 0, 1))
    intensity = 1 - u1 * (1 - mu) - u2 * (1 - mu) ** 2
    norm = 1 - u1 / 3 - u2 / 6
    flux = 1 - overlap * intensity / norm

    configure_style()
    fig, ax = plt.subplots(figsize=TARGET_FIGSIZE)
    ax.plot(time_h, flux, color=BLUE, lw=2.6)
    ax.axhline(1.0, color=GRAY, lw=1.45, ls="--", alpha=0.55)
    ax.axvspan(-half, half, color=BLUE, alpha=0.075, label="transit window")

    # Show the ppm scale explicitly rather than exaggerating the dip without a label.
    y_pad = max(depth * 0.45, 2.0e-5)
    ax.set_ylim(1 - depth - y_pad, 1 + y_pad)
    ax.set_xlim(time_h.min(), time_h.max())
    ax.grid(True, which="major")
    ax.set_xlabel("Time from mid-transit (hours)")
    ax.set_ylabel("Relative flux")
    ax.yaxis.set_major_formatter(FuncFormatter(lambda y, _: f"{y:.6f}"))
    ax.set_title(f"Transit light-curve model — {planet.name}", loc="left", fontsize=18, fontweight="bold", pad=10)
    ax.text(
        0.015,
        0.95,
        f"Rp/R* = {k:.4f} · depth ≈ {depth * 1_000_000:.0f} ppm · T14 ≈ {duration:.2f} h",
        transform=ax.transAxes,
        ha="left",
        va="top",
        fontsize=14,
        color=MUTED,
        bbox={"boxstyle": "round,pad=0.22", "facecolor": PAPER, "edgecolor": "none", "alpha": 0.88},
    )
    annotate_data_source(ax, "quadratic limb-darkened geometry")
    save(fig, path)


def solve_kepler(mean_anomaly: np.ndarray, eccentricity: float) -> np.ndarray:
    ecc = min(0.95, max(0.0, float(eccentricity)))
    E = mean_anomaly.copy()
    if ecc > 0.8:
        E = np.full_like(mean_anomaly, math.pi)
    for _ in range(30):
        f = E - ecc * np.sin(E) - mean_anomaly
        fp = 1 - ecc * np.cos(E)
        step = f / fp
        E -= step
        if np.max(np.abs(step)) < 1e-12:
            break
    return E


def plot_rv_curve(planet: Planet, path: Path) -> None:
    K = rv_semi_amplitude_ms(planet)
    if not positive(K) or not positive(planet.orbital_period_days):
        placeholder(path, "Radial velocity curve", "Planet mass, orbital period, and stellar mass are required for an RV figure.")
        return

    phase = np.linspace(0, 1, 720)
    M = 2 * np.pi * phase
    E = solve_kepler(M, planet.eccentricity)
    nu = 2 * np.arctan2(np.sqrt(1 + planet.eccentricity) * np.sin(E / 2), np.sqrt(1 - planet.eccentricity) * np.cos(E / 2))
    omega = np.pi / 2
    rv = K * (np.cos(nu + omega) + planet.eccentricity * np.cos(omega))

    configure_style()
    fig, ax = plt.subplots(figsize=TARGET_FIGSIZE)
    ax.plot(phase, rv, color=TERRA, lw=2.6)
    ax.axhline(0, color=GRAY, lw=1.45, ls="--", alpha=0.65)
    ax.fill_between(phase, rv, 0, color=TERRA, alpha=0.08)
    ax.grid(True)
    ax.set_xlim(0, 1)
    ax.set_xlabel("Orbital phase")
    ax.set_ylabel("Stellar radial velocity (m/s)")
    ax.set_title(f"Keplerian RV model — {planet.name}", loc="left", fontsize=18, fontweight="bold", pad=10)
    ax.text(
        0.015,
        0.95,
        f"K ≈ {K:.3g} m s^-1 · P ≈ {planet.orbital_period_days:.4g} d · e = {planet.eccentricity:.2f}",
        transform=ax.transAxes,
        ha="left",
        va="top",
        fontsize=14,
        color=MUTED,
        bbox={"boxstyle": "round,pad=0.22", "facecolor": PAPER, "edgecolor": "none", "alpha": 0.88},
    )
    annotate_data_source(ax, "single-planet Keplerian model")
    save(fig, path)


def plot_mass_radius_context(planets: list[Planet], selected: Planet, path: Path) -> None:
    rows = [p for p in planets if positive(p.mass_earth) and positive(p.radius_earth)]
    if not rows:
        placeholder(path, "Mass-radius context", "The catalog needs planet masses and radii for this population diagram.")
        return

    radius = np.array([p.radius_earth for p in rows], dtype=float)
    mass = np.array([p.mass_earth for p in rows], dtype=float)

    configure_style()
    fig, ax = plt.subplots(figsize=TARGET_FIGSIZE)
    ax.scatter(radius, mass, s=34, c=BLUE, alpha=0.62, edgecolors="none", label="catalog planets")

    if positive(selected.radius_earth) and positive(selected.mass_earth):
        ax.scatter(
            [selected.radius_earth],
            [selected.mass_earth],
            s=170,
            c=GOLD,
            edgecolors=INK,
            linewidths=0.9,
            zorder=5,
            label=selected.name,
        )
        ax.annotate(
            selected.name,
            xy=(selected.radius_earth, selected.mass_earth),
            xytext=(8, 8),
            textcoords="offset points",
            fontsize=14,
            color=INK,
            arrowprops={"arrowstyle": "-", "color": MUTED, "lw": 0.8},
        )

    rgrid = np.logspace(-0.45, 1.25, 220)
    for density, color, label in [(1.0, VIOLET, "ρ = 1 g cm⁻³"), (5.514, SAGE, "ρ = Earth"), (10.0, TERRA, "ρ = 10 g cm⁻³")]:
        mgrid = (density / EARTH_DENSITY_G_CM3) * rgrid**3
        ax.plot(rgrid, mgrid, color=color, ls="--", lw=1.5, alpha=0.72, label=label)

    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_xlim(max(0.25, np.nanmin(radius) * 0.72), max(24, np.nanmax(radius) * 1.25))
    ax.set_ylim(max(0.03, np.nanmin(mass) * 0.55), max(5000, np.nanmax(mass) * 1.35))
    ax.grid(True, which="major")
    ax.grid(True, which="minor", alpha=0.18)
    ax.xaxis.set_minor_formatter(NullFormatter())
    ax.yaxis.set_minor_formatter(NullFormatter())
    ax.xaxis.set_major_locator(LogLocator(base=10.0, numticks=6))
    ax.yaxis.set_major_locator(LogLocator(base=10.0, numticks=6))
    ax.xaxis.set_major_formatter(FuncFormatter(lambda x, _: f"{x:g}"))
    ax.yaxis.set_major_formatter(FuncFormatter(lambda y, _: f"{y:g}"))
    ax.set_xlabel("Planet radius (Earth radii)")
    ax.set_ylabel("Planet mass (Earth masses)")
    ax.set_title("Mass-radius population context", loc="left", fontsize=18, fontweight="bold")
    ax.legend(loc="upper left", fontsize=10, ncol=2)
    annotate_data_source(ax, "archive masses/radii + density contours")
    save(fig, path)


def plot_radius_flux_map(planets: list[Planet], path: Path) -> None:
    rows = [p for p in planets if positive(p.radius_earth) and positive(p.insolation_earth)]
    if len(rows) < 3:
        placeholder(path, "Radius versus incident flux", "The catalog needs planet radii and incident flux values for this figure.")
        return
    radius = np.array([p.radius_earth for p in rows], dtype=float)
    flux = np.array([p.insolation_earth for p in rows], dtype=float)
    years = np.array([p.discovery_year if positive(p.discovery_year) else np.nan for p in rows], dtype=float)
    colors = np.where(np.isnan(years), 2000, years)

    configure_style()
    fig, ax = plt.subplots(figsize=GLOBAL_FIGSIZE)
    scatter = ax.scatter(flux, radius, c=colors, cmap="viridis", s=46, alpha=0.72, edgecolors="none")
    ax.axvspan(0.32, 1.78, color=SAGE, alpha=0.14, label="rough HZ flux interval")
    ax.axvline(1, color=GRAY, ls="--", lw=1.3, label="Earth flux")
    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_xlabel("Incident flux (Earth units)")
    ax.set_ylabel("Planet radius (Earth radii)")
    ax.set_title("Planet radius versus incident stellar flux", loc="left", fontsize=18, fontweight="bold")
    ax.grid(True, which="major")
    ax.grid(True, which="minor", alpha=0.18)
    ax.xaxis.set_major_formatter(FuncFormatter(lambda x, _: f"{x:g}"))
    ax.yaxis.set_major_formatter(FuncFormatter(lambda y, _: f"{y:g}"))
    cb = fig.colorbar(scatter, ax=ax, fraction=0.046, pad=0.04)
    cb.set_label("Discovery year")
    ax.legend(loc="lower left", fontsize=10.5)
    annotate_data_source(ax, "catalog parameters")
    save(fig, path)


def plot_discovery_timeline(planets: list[Planet], path: Path) -> None:
    years = [int(p.discovery_year) for p in planets if positive(p.discovery_year)]
    if not years:
        placeholder(path, "Discovery timeline", "Discovery years are required for this figure.")
        return
    series = pd.Series(years).value_counts().sort_index()
    cumulative = series.cumsum()
    configure_style()
    fig, ax = plt.subplots(figsize=GLOBAL_FIGSIZE)
    ax.bar(series.index, series.values, color=BLUE, alpha=0.78, label="discoveries per year")
    ax2 = ax.twinx()
    ax2.plot(cumulative.index, cumulative.values, color=TERRA, lw=2.6, label="cumulative")
    ax.set_xlabel("Discovery year")
    ax.set_ylabel("Planets in loaded catalog")
    ax2.set_ylabel("Cumulative count")
    ax.grid(True, axis="y")
    ax.set_title("Discovery history in the loaded dataset", loc="left", fontsize=18, fontweight="bold")
    handles1, labels1 = ax.get_legend_handles_labels()
    handles2, labels2 = ax2.get_legend_handles_labels()
    ax.legend(handles1 + handles2, labels1 + labels2, loc="upper left", fontsize=10.5)
    annotate_data_source(ax, "loaded JSON catalog")
    save(fig, path)


def plot_method_distribution(planets: list[Planet], path: Path) -> None:
    methods = pd.Series([p.method or "Unknown" for p in planets]).value_counts().head(10)
    if methods.empty:
        placeholder(path, "Discovery methods", "Discovery method labels are required for this figure.")
        return
    configure_style()
    fig, ax = plt.subplots(figsize=GLOBAL_FIGSIZE)
    methods.sort_values().plot(kind="barh", ax=ax, color=BLUE, alpha=0.78)
    ax.set_xlabel("Planets in loaded catalog")
    ax.set_ylabel("")
    ax.set_title("Discovery-method distribution", loc="left", fontsize=18, fontweight="bold")
    ax.grid(True, axis="x")
    annotate_data_source(ax, "loaded JSON catalog")
    save(fig, path)


def select_targets(planets: list[Planet], limit: int) -> list[Planet]:
    by_name = {p.name: p for p in planets}
    selected: list[Planet] = []
    seen: set[str] = set()
    for name in PRIORITY_TARGETS:
        if name in by_name and name not in seen:
            selected.append(by_name[name])
            seen.add(name)

    def score(p: Planet) -> tuple[int, str]:
        fields = [p.radius_earth, p.mass_earth, p.orbital_period_days, p.stellar_radius_solar, p.stellar_mass_solar, p.semi_major_axis_au]
        completeness = sum(1 for f in fields if positive(f))
        hz_bonus = 2 if hz_distances(p) and positive(p.semi_major_axis_au) else 0
        transit_bonus = 1 if transit_depth_ppm(p) else 0
        rv_bonus = 1 if rv_semi_amplitude_ms(p) else 0
        return (completeness + hz_bonus + transit_bonus + rv_bonus, p.name)

    for planet in sorted(planets, key=score, reverse=True):
        if len(selected) >= limit:
            break
        if planet.name not in seen:
            selected.append(planet)
            seen.add(planet.name)
    return selected[:limit]


def load_catalog(path: Path) -> tuple[dict[str, Any], list[Planet]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    raw_planets = payload.get("planets", payload) if isinstance(payload, dict) else payload
    meta = payload.get("meta", {}) if isinstance(payload, dict) else {}
    planets = []
    for row in raw_planets:
        planet = normalize_planet(row)
        if planet is not None:
            planets.append(planet)
    return meta, planets


def write_manifest(output_dir: Path, meta: dict[str, Any], target_paths: dict[str, dict[str, str]]) -> None:
    manifest = {
        "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "generator": "scripts/generate_science_plots.py",
        "catalog_mode": meta.get("mode"),
        "target_count": len(target_paths),
        "target_plots": target_paths,
        "global_plots": {
            "radius_flux": "./assets/plots/global/radius_flux_map.svg",
            "mass_radius": "./assets/plots/global/mass_radius_population.svg",
            "timeline": "./assets/plots/global/discovery_timeline.svg",
            "methods": "./assets/plots/global/method_distribution.svg",
        },
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate Matplotlib SVG figures for the static exoplanet site.")
    parser.add_argument("--data", default="data/exoplanets.json", type=Path, help="Path to exoplanets JSON dataset.")
    parser.add_argument("--output", default="assets/plots", type=Path, help="Directory for generated SVG figures.")
    parser.add_argument("--target-limit", default=16, type=int, help="Maximum number of per-target figure packs to generate.")
    args = parser.parse_args()

    meta, planets = load_catalog(args.data)
    if not planets:
        raise SystemExit(f"No planet records found in {args.data}")

    output_dir = args.output
    global_dir = output_dir / "global"
    target_dir = output_dir / "targets"
    output_dir.mkdir(parents=True, exist_ok=True)
    global_dir.mkdir(parents=True, exist_ok=True)
    target_dir.mkdir(parents=True, exist_ok=True)

    plot_radius_flux_map(planets, global_dir / "radius_flux_map.svg")
    plot_mass_radius_context(planets, planets[0], global_dir / "mass_radius_population.svg")
    plot_discovery_timeline(planets, global_dir / "discovery_timeline.svg")
    plot_method_distribution(planets, global_dir / "method_distribution.svg")

    target_paths: dict[str, dict[str, str]] = {}
    for planet in select_targets(planets, max(1, args.target_limit)):
        slug = slugify(planet.name)
        planet_dir = target_dir / slug
        rel_base = f"./assets/plots/targets/{slug}"
        plot_habitable_zone(planet, planet_dir / "habitable_zone.svg")
        plot_transit_curve(planet, planet_dir / "transit_light_curve.svg")
        plot_rv_curve(planet, planet_dir / "radial_velocity.svg")
        plot_mass_radius_context(planets, planet, planet_dir / "mass_radius_context.svg")
        target_paths[planet.name] = {
            "habitable_zone": f"{rel_base}/habitable_zone.svg",
            "transit_light_curve": f"{rel_base}/transit_light_curve.svg",
            "radial_velocity": f"{rel_base}/radial_velocity.svg",
            "mass_radius_context": f"{rel_base}/mass_radius_context.svg",
        }

    write_manifest(output_dir, meta, target_paths)
    print(f"Generated {len(target_paths)} target plot packs in {output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
