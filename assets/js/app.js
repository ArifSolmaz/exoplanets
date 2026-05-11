const DATA_URL = './data/exoplanets.json';
const PAGE_SIZE = 12;

const CONSTANTS = {
  earthDensity: 5.514,
  earthEscapeVelocityKmS: 11.186,
  earthGravity: 9.80665,
  earthMassInSolarMass: 3.00348959632e-6,
  earthRadiusInSolarRadii: 1 / 109.076,
  earthRadiusMeters: 6.371e6,
  solarRadiusMeters: 6.957e8,
  solarRadiusAu: 0.00465047,
  earthRadiusAu: 4.26352e-5,
  solarTeff: 5778,
  zeroAlbedoEarthTempK: 278.5,
  boltzmann: 1.380649e-23,
  atomicMassUnit: 1.66053906660e-27,
};

const DEFAULT_ASSUMPTIONS = {
  albedo: 0.30,
  molecularWeight: 28.97,
  scaleHeights: 5,
};

// Coefficients from Ravi Kopparapu's public HZ_coefficients.dat for Kopparapu et al. (2014).
// S_eff = S_effSun + a*T + b*T^2 + c*T^3 + d*T^4, where T = Teff - 5780 K.
const HZ_LIMITS = {
  recentVenus: {
    label: 'Recent Venus',
    coeff: [1.776, 2.136e-4, 2.533e-8, -1.332e-11, -3.097e-15],
  },
  runawayGreenhouse: {
    label: 'Runaway greenhouse',
    coeff: [1.107, 1.332e-4, 1.580e-8, -8.308e-12, -1.931e-15],
  },
  maximumGreenhouse: {
    label: 'Maximum greenhouse',
    coeff: [0.356, 6.171e-5, 1.698e-9, -3.198e-12, -5.575e-16],
  },
  earlyMars: {
    label: 'Early Mars',
    coeff: [0.320, 5.547e-5, 1.526e-9, -2.874e-12, -5.011e-16],
  },
};

const state = {
  planets: [],
  filtered: [],
  visible: PAGE_SIZE,
  selectedName: null,
  meta: {},
};

const elements = {
  header: document.querySelector('.site-header'),
  navToggle: document.querySelector('.nav-toggle'),
  navLinks: document.querySelector('#navLinks'),
  dataStatus: document.querySelector('#dataStatus'),
  statPlanets: document.querySelector('#statPlanets'),
  statMethods: document.querySelector('#statMethods'),
  statHz: document.querySelector('#statHz'),
  statDensity: document.querySelector('#statDensity'),
  methodChart: document.querySelector('#methodChart'),
  methodChartNote: document.querySelector('#methodChartNote'),
  sizeChart: document.querySelector('#sizeChart'),
  timelineChart: document.querySelector('#timelineChart'),
  physicsMap: document.querySelector('#physicsMap'),
  hzChart: document.querySelector('#hzChart'),
  searchInput: document.querySelector('#searchInput'),
  methodFilter: document.querySelector('#methodFilter'),
  sizeFilter: document.querySelector('#sizeFilter'),
  scienceFilter: document.querySelector('#scienceFilter'),
  eraFilter: document.querySelector('#eraFilter'),
  sortSelect: document.querySelector('#sortSelect'),
  resetFilters: document.querySelector('#resetFilters'),
  resultCount: document.querySelector('#resultCount'),
  planetList: document.querySelector('#planetList'),
  loadMore: document.querySelector('#loadMore'),
  detailTitle: document.querySelector('#detailTitle'),
  detailSubtitle: document.querySelector('#detailSubtitle'),
  detailList: document.querySelector('#detailList'),
  detailScienceList: document.querySelector('#detailScienceList'),
  detailDescription: document.querySelector('#detailDescription'),
  analyzeButton: document.querySelector('#analyzeButton'),
  labPlanetSelect: document.querySelector('#labPlanetSelect'),
  albedoSlider: document.querySelector('#albedoSlider'),
  albedoOutput: document.querySelector('#albedoOutput'),
  atmosphereSelect: document.querySelector('#atmosphereSelect'),
  scaleHeightsInput: document.querySelector('#scaleHeightsInput'),
  scaleHeightsOutput: document.querySelector('#scaleHeightsOutput'),
  labTitle: document.querySelector('#labTitle'),
  labSubtitle: document.querySelector('#labSubtitle'),
  labVerdict: document.querySelector('#labVerdict'),
  derivedMetrics: document.querySelector('#derivedMetrics'),
  hzGraphic: document.querySelector('#hzGraphic'),
  transitGraphic: document.querySelector('#transitGraphic'),
  rvGraphic: document.querySelector('#rvGraphic'),
  massRadiusGraphic: document.querySelector('#massRadiusGraphic'),
  labCaveats: document.querySelector('#labCaveats'),
};

function compactNumber(value) {
  if (!Number.isFinite(Number(value))) return '—';
  return new Intl.NumberFormat('en', { notation: value >= 10000 ? 'compact' : 'standard' }).format(value);
}

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'Unknown';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'Unknown';
  if (Math.abs(numeric) >= 1000) return new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(numeric);
  if (Math.abs(numeric) >= 100) return new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(numeric);
  if (Math.abs(numeric) >= 10) return new Intl.NumberFormat('en', { maximumFractionDigits: Math.min(digits, 2) }).format(numeric);
  if (Math.abs(numeric) >= 1) return new Intl.NumberFormat('en', { maximumFractionDigits: digits }).format(numeric);
  return new Intl.NumberFormat('en', { maximumFractionDigits: Math.max(digits, 3) }).format(numeric);
}

function formatScientific(value, digits = 2) {
  if (!Number.isFinite(value)) return 'Unknown';
  if (Math.abs(value) >= 0.001 && Math.abs(value) < 10000) return formatNumber(value, digits);
  return value.toExponential(digits);
}

function asNumber(value) {
  if (value === null || value === undefined || value === '' || value === 'NaN' || value === 'nan') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function firstNumber(...values) {
  for (const value of values) {
    const numeric = asNumber(value);
    if (numeric !== null) return numeric;
  }
  return null;
}

function isPositive(value) {
  return Number.isFinite(value) && value > 0;
}

function normalizeText(value, fallback = 'Unknown') {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function radiusClass(radius) {
  const value = asNumber(radius);
  if (value === null) return 'Unknown';
  if (value < 1.25) return 'Terrestrial';
  if (value < 2) return 'Super-Earth';
  if (value < 4) return 'Sub-Neptune';
  if (value < 10) return 'Giant';
  return 'Super-Jupiter';
}

function normalizePlanet(raw) {
  const radius = firstNumber(raw.radius_earth, raw.pl_rade);
  const mass = firstNumber(raw.mass_earth, raw.pl_bmasse, raw.pl_masse);
  const period = firstNumber(raw.orbital_period_days, raw.pl_orbper);
  const distance = firstNumber(raw.distance_pc, raw.sy_dist);
  const year = firstNumber(raw.discovery_year, raw.disc_year);
  const stellarTemp = firstNumber(raw.stellar_temp_k, raw.st_teff);
  const stLumLog = firstNumber(raw.stellar_luminosity_log_solar, raw.st_lum);
  const luminosity = firstNumber(raw.stellar_luminosity_solar, raw.luminosity_solar);
  const semiMajor = firstNumber(raw.semi_major_axis_au, raw.pl_orbsmax);

  return {
    name: normalizeText(raw.name ?? raw.pl_name, ''),
    host: normalizeText(raw.host ?? raw.hostname),
    method: normalizeText(raw.method ?? raw.discoverymethod),
    discovery_year: year === null ? null : Math.round(year),
    facility: normalizeText(raw.facility ?? raw.disc_facility),
    radius_earth: radius,
    mass_earth: mass,
    orbital_period_days: period,
    distance_pc: distance,
    stellar_temp_k: stellarTemp,
    stellar_radius_solar: firstNumber(raw.stellar_radius_solar, raw.st_rad),
    stellar_mass_solar: firstNumber(raw.stellar_mass_solar, raw.st_mass),
    stellar_luminosity_solar: luminosity ?? (stLumLog === null ? null : 10 ** stLumLog),
    stellar_luminosity_log_solar: stLumLog,
    equilibrium_temp_k: firstNumber(raw.equilibrium_temp_k, raw.pl_eqt),
    semi_major_axis_au: semiMajor,
    eccentricity: firstNumber(raw.eccentricity, raw.pl_orbeccen) ?? 0,
    inclination_deg: firstNumber(raw.inclination_deg, raw.pl_orbincl),
    insolation_earth: firstNumber(raw.insolation_earth, raw.pl_insol),
    density_g_cm3: firstNumber(raw.density_g_cm3, raw.pl_dens),
    vmag: firstNumber(raw.vmag, raw.sy_vmag),
    kmag: firstNumber(raw.kmag, raw.sy_kmag),
    spectral_type: normalizeText(raw.spectral_type ?? raw.st_spectype, 'Unknown'),
    description: normalizeText(raw.description, ''),
    tag: normalizeText(raw.tag, radiusClass(radius)),
    sizeClass: radiusClass(radius),
  };
}

function median(values) {
  const clean = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!clean.length) return null;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 === 0 ? (clean[mid - 1] + clean[mid]) / 2 : clean[mid];
}

function countBy(items, keyFn) {
  return items.reduce((acc, item) => {
    const key = keyFn(item);
    acc.set(key, (acc.get(key) ?? 0) + 1);
    return acc;
  }, new Map());
}

function sortEntriesDescending(map) {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
}

function discoveryEra(year) {
  if (!Number.isFinite(year)) return 'unknown';
  if (year < 2010) return 'early';
  if (year <= 2018) return 'kepler';
  return 'recent';
}

function massFromLuminosity(luminosity) {
  if (!isPositive(luminosity)) return null;
  if (luminosity < 0.033) return Math.pow(luminosity / 0.23, 1 / 2.3);
  if (luminosity < 16) return Math.pow(luminosity, 1 / 4);
  return Math.pow(luminosity / 1.5, 1 / 3.5);
}

function luminosityFromTemperature(teff) {
  if (!isPositive(teff)) return null;
  const ratio = teff / CONSTANTS.solarTeff;
  return Math.min(2000, Math.max(0.0002, ratio ** 8));
}

function seffForLimit(limitKey, stellarTemp) {
  const limit = HZ_LIMITS[limitKey];
  const teff = isPositive(stellarTemp) ? stellarTemp : 5780;
  const tStar = teff - 5780;
  const [s0, a, b, c, d] = limit.coeff;
  return s0 + a * tStar + b * tStar ** 2 + c * tStar ** 3 + d * tStar ** 4;
}

function computeHabitableZone(luminosity, stellarTemp, semiMajor) {
  if (!isPositive(luminosity)) {
    return {
      category: 'unknown',
      label: 'Habitable-zone placement unknown',
      className: 'unknown',
      caveat: 'Stellar luminosity is missing or could not be estimated.',
    };
  }

  const calibrated = isPositive(stellarTemp) && stellarTemp >= 2600 && stellarTemp <= 7200;
  const fluxes = {
    recentVenus: seffForLimit('recentVenus', stellarTemp),
    runawayGreenhouse: seffForLimit('runawayGreenhouse', stellarTemp),
    maximumGreenhouse: seffForLimit('maximumGreenhouse', stellarTemp),
    earlyMars: seffForLimit('earlyMars', stellarTemp),
  };

  const distances = {
    optimisticInner: Math.sqrt(luminosity / fluxes.recentVenus),
    conservativeInner: Math.sqrt(luminosity / fluxes.runawayGreenhouse),
    conservativeOuter: Math.sqrt(luminosity / fluxes.maximumGreenhouse),
    optimisticOuter: Math.sqrt(luminosity / fluxes.earlyMars),
  };

  if (!isPositive(semiMajor)) {
    return {
      category: 'unknown',
      label: 'Orbit unknown relative to HZ',
      className: 'unknown',
      fluxes,
      distances,
      calibrated,
      caveat: 'Semi-major axis could not be measured or estimated.',
    };
  }

  if (semiMajor < distances.optimisticInner) {
    return {
      category: 'hot',
      label: 'Interior to optimistic HZ — likely over-irradiated',
      className: 'hot',
      fluxes,
      distances,
      calibrated,
    };
  }
  if (semiMajor <= distances.conservativeInner) {
    return {
      category: 'optimistic',
      label: 'Inside optimistic HZ, near the inner edge',
      className: 'good',
      fluxes,
      distances,
      calibrated,
    };
  }
  if (semiMajor <= distances.conservativeOuter) {
    return {
      category: 'conservative',
      label: 'Inside conservative HZ',
      className: 'good',
      fluxes,
      distances,
      calibrated,
    };
  }
  if (semiMajor <= distances.optimisticOuter) {
    return {
      category: 'optimistic',
      label: 'Inside optimistic HZ, near the outer edge',
      className: 'good',
      fluxes,
      distances,
      calibrated,
    };
  }
  return {
    category: 'cold',
    label: 'Beyond optimistic HZ — likely under-irradiated',
    className: 'cold',
    fluxes,
    distances,
    calibrated,
  };
}

function estimateCoreMassFraction(massEarth, radiusEarth) {
  if (!isPositive(massEarth) || !isPositive(radiusEarth)) return null;
  if (massEarth < 1 || massEarth > 8 || radiusEarth > 2.2) return null;
  const cmf = (1.07 - radiusEarth / Math.pow(massEarth, 1 / 3.7)) / 0.21;
  if (!Number.isFinite(cmf)) return null;
  return cmf;
}

function classifyComposition(radiusEarth, massEarth, density) {
  if (!isPositive(radiusEarth)) return 'Unknown composition';
  if (radiusEarth >= 4) return 'Gas giant / ice giant regime';
  if (!isPositive(density)) {
    if (radiusEarth < 1.25) return 'Terrestrial-size, density unknown';
    if (radiusEarth < 2) return 'Super-Earth-size, density unknown';
    return 'Sub-Neptune-size, density unknown';
  }
  if (radiusEarth <= 2.2 && density >= 7.5) return 'Dense rocky / iron-rich candidate';
  if (radiusEarth <= 2.2 && density >= 4.0) return 'Rocky-compatible bulk density';
  if (radiusEarth <= 4 && density >= 2.0) return 'Volatile-rich or mixed interior';
  return 'Low-density envelope likely';
}

function derivePlanetScience(planet, assumptions = DEFAULT_ASSUMPTIONS) {
  const notes = [];
  const sources = [];

  let stellarLuminosity = planet.stellar_luminosity_solar;
  let stellarRadius = planet.stellar_radius_solar;
  let stellarMass = planet.stellar_mass_solar;
  let semiMajor = planet.semi_major_axis_au;
  let insolation = planet.insolation_earth;
  const stellarTemp = planet.stellar_temp_k;
  const period = planet.orbital_period_days;
  const eccentricity = Number.isFinite(planet.eccentricity) ? Math.min(0.99, Math.max(0, planet.eccentricity)) : 0;

  if (!isPositive(insolation) && isPositive(stellarLuminosity) && isPositive(semiMajor)) {
    insolation = stellarLuminosity / semiMajor ** 2;
    sources.push('insolation from luminosity and orbit');
  }

  if (!isPositive(stellarLuminosity) && isPositive(insolation) && isPositive(semiMajor)) {
    stellarLuminosity = insolation * semiMajor ** 2;
    notes.push('Stellar luminosity was reconstructed from archive insolation and semi-major axis.');
  }

  if (!isPositive(stellarLuminosity) && isPositive(planet.equilibrium_temp_k) && isPositive(semiMajor)) {
    const estimatedFlux = (planet.equilibrium_temp_k / CONSTANTS.zeroAlbedoEarthTempK) ** 4;
    if (isPositive(estimatedFlux)) {
      insolation = insolation ?? estimatedFlux;
      stellarLuminosity = estimatedFlux * semiMajor ** 2;
      notes.push('Stellar luminosity and insolation were approximated from archive equilibrium temperature.');
    }
  }

  if (!isPositive(stellarLuminosity) && isPositive(stellarTemp)) {
    stellarLuminosity = luminosityFromTemperature(stellarTemp);
    notes.push('Stellar luminosity was roughly estimated from effective temperature using a main-sequence scaling.');
  }

  if (!isPositive(stellarRadius) && isPositive(stellarLuminosity) && isPositive(stellarTemp)) {
    stellarRadius = Math.sqrt(stellarLuminosity) / (stellarTemp / CONSTANTS.solarTeff) ** 2;
    notes.push('Stellar radius was estimated from luminosity and effective temperature.');
  }

  if (!isPositive(stellarMass) && isPositive(stellarLuminosity)) {
    stellarMass = massFromLuminosity(stellarLuminosity);
    notes.push('Stellar mass was estimated from a simplified mass-luminosity relation.');
  }

  if (!isPositive(semiMajor) && isPositive(period) && isPositive(stellarMass)) {
    semiMajor = Math.cbrt(stellarMass * (period / 365.25) ** 2);
    notes.push('Semi-major axis was estimated from orbital period and stellar mass using Kepler\'s third law.');
  }

  if (!isPositive(insolation) && isPositive(stellarLuminosity) && isPositive(semiMajor)) {
    insolation = stellarLuminosity / semiMajor ** 2;
    sources.push('insolation from estimated orbit and luminosity');
  }

  const modelEquilibriumTemp = isPositive(insolation)
    ? CONSTANTS.zeroAlbedoEarthTempK * insolation ** 0.25 * Math.max(0, 1 - assumptions.albedo) ** 0.25
    : null;

  const density = isPositive(planet.density_g_cm3)
    ? planet.density_g_cm3
    : (isPositive(planet.mass_earth) && isPositive(planet.radius_earth)
      ? CONSTANTS.earthDensity * planet.mass_earth / planet.radius_earth ** 3
      : null);

  const surfaceGravityEarth = isPositive(planet.mass_earth) && isPositive(planet.radius_earth)
    ? planet.mass_earth / planet.radius_earth ** 2
    : null;

  const surfaceGravityMs2 = isPositive(surfaceGravityEarth) ? surfaceGravityEarth * CONSTANTS.earthGravity : null;
  const escapeVelocity = isPositive(planet.mass_earth) && isPositive(planet.radius_earth)
    ? CONSTANTS.earthEscapeVelocityKmS * Math.sqrt(planet.mass_earth / planet.radius_earth)
    : null;

  const planetRadiusSolar = isPositive(planet.radius_earth)
    ? planet.radius_earth * CONSTANTS.earthRadiusInSolarRadii
    : null;

  const transitDepthPpm = isPositive(planetRadiusSolar) && isPositive(stellarRadius)
    ? (planetRadiusSolar / stellarRadius) ** 2 * 1_000_000
    : null;

  const transitDurationHours = isPositive(period) && isPositive(semiMajor) && isPositive(stellarRadius)
    ? (period / Math.PI) * Math.asin(Math.min(1, ((stellarRadius * CONSTANTS.solarRadiusAu) + ((planet.radius_earth ?? 0) * CONSTANTS.earthRadiusAu)) / semiMajor)) * 24
    : null;

  const sinInclination = isPositive(planet.inclination_deg)
    ? Math.sin((planet.inclination_deg * Math.PI) / 180)
    : 1;

  const rvSemiAmplitude = isPositive(planet.mass_earth) && isPositive(period) && isPositive(stellarMass)
    ? 0.08945 * planet.mass_earth * Math.pow(period / 365.25, -1 / 3) * Math.pow(stellarMass, -2 / 3) * sinInclination / Math.sqrt(1 - eccentricity ** 2)
    : null;

  const astrometricAmplitudeMicroArcsec = isPositive(planet.mass_earth) && isPositive(stellarMass) && isPositive(semiMajor) && isPositive(planet.distance_pc)
    ? (planet.mass_earth * CONSTANTS.earthMassInSolarMass / stellarMass) * (semiMajor / planet.distance_pc) * 1_000_000
    : null;

  let scaleHeightKm = null;
  let transmissionSignalPpm = null;
  if (isPositive(modelEquilibriumTemp) && isPositive(surfaceGravityMs2) && isPositive(planet.radius_earth) && isPositive(stellarRadius)) {
    const scaleHeightMeters = CONSTANTS.boltzmann * modelEquilibriumTemp / (assumptions.molecularWeight * CONSTANTS.atomicMassUnit * surfaceGravityMs2);
    scaleHeightKm = scaleHeightMeters / 1000;
    transmissionSignalPpm = (2 * assumptions.scaleHeights * scaleHeightMeters * planet.radius_earth * CONSTANTS.earthRadiusMeters)
      / (stellarRadius * CONSTANTS.solarRadiusMeters) ** 2 * 1_000_000;
  }

  const hz = computeHabitableZone(stellarLuminosity, stellarTemp, semiMajor);
  if (hz.calibrated === false) {
    notes.push('Kopparapu HZ coefficients are formally calibrated for roughly 2600–7200 K stars; this target falls outside or lacks Teff.');
  }
  if (hz.caveat) notes.push(hz.caveat);

  const coreMassFraction = estimateCoreMassFraction(planet.mass_earth, planet.radius_earth);
  if (coreMassFraction !== null && (coreMassFraction < 0 || coreMassFraction > 0.4)) {
    notes.push('The rocky-planet core-mass-fraction estimate is outside the 0–0.4 calibration range and should be treated qualitatively.');
  }

  if (sources.length) notes.push(`Derived fields used: ${sources.join(', ')}.`);

  return {
    stellarLuminosity,
    stellarRadius,
    stellarMass,
    semiMajor,
    insolation,
    modelEquilibriumTemp,
    density,
    surfaceGravityEarth,
    surfaceGravityMs2,
    escapeVelocity,
    transitDepthPpm,
    transitDurationHours,
    rvSemiAmplitude,
    astrometricAmplitudeMicroArcsec,
    scaleHeightKm,
    transmissionSignalPpm,
    hz,
    composition: classifyComposition(planet.radius_earth, planet.mass_earth, density),
    coreMassFraction,
    notes: [...new Set(notes)],
  };
}

function getLabAssumptions() {
  return {
    albedo: Number(elements.albedoSlider.value),
    molecularWeight: Number(elements.atmosphereSelect.value),
    scaleHeights: Number(elements.scaleHeightsInput.value),
  };
}

function getDefaultScience(planet) {
  return derivePlanetScience(planet, DEFAULT_ASSUMPTIONS);
}

function sortPlanets(planets, sortMode) {
  const copy = [...planets];
  const unknownLast = (a, b, selector) => {
    const av = selector(a);
    const bv = selector(b);
    if (!Number.isFinite(av) && !Number.isFinite(bv)) return a.name.localeCompare(b.name);
    if (!Number.isFinite(av)) return 1;
    if (!Number.isFinite(bv)) return -1;
    return av - bv || a.name.localeCompare(b.name);
  };

  switch (sortMode) {
    case 'year-desc':
      return copy.sort((a, b) => {
        const ay = a.discovery_year ?? -Infinity;
        const by = b.discovery_year ?? -Infinity;
        return by - ay || a.name.localeCompare(b.name);
      });
    case 'distance-asc':
      return copy.sort((a, b) => unknownLast(a, b, (planet) => planet.distance_pc));
    case 'radius-asc':
      return copy.sort((a, b) => unknownLast(a, b, (planet) => planet.radius_earth));
    case 'period-asc':
      return copy.sort((a, b) => unknownLast(a, b, (planet) => planet.orbital_period_days));
    case 'earth-flux':
      return copy.sort((a, b) => unknownLast(a, b, (planet) => Math.abs(Math.log10((getDefaultScience(planet).insolation ?? Infinity) / 1))));
    case 'transit-depth-desc':
      return copy.sort((a, b) => (getDefaultScience(b).transitDepthPpm ?? -Infinity) - (getDefaultScience(a).transitDepthPpm ?? -Infinity) || a.name.localeCompare(b.name));
    case 'rv-desc':
      return copy.sort((a, b) => (getDefaultScience(b).rvSemiAmplitude ?? -Infinity) - (getDefaultScience(a).rvSemiAmplitude ?? -Infinity) || a.name.localeCompare(b.name));
    case 'density-desc':
      return copy.sort((a, b) => (getDefaultScience(b).density ?? -Infinity) - (getDefaultScience(a).density ?? -Infinity) || a.name.localeCompare(b.name));
    case 'name-asc':
    default:
      return copy.sort((a, b) => a.name.localeCompare(b.name));
  }
}

function scienceFilterMatch(planet, filterValue) {
  if (filterValue === 'all') return true;
  const science = getDefaultScience(planet);
  switch (filterValue) {
    case 'hz':
      return ['optimistic', 'conservative'].includes(science.hz.category);
    case 'conservative-hz':
      return science.hz.category === 'conservative';
    case 'rocky-density':
      return isPositive(planet.radius_earth) && planet.radius_earth <= 2.2 && isPositive(science.density);
    case 'transit-friendly':
      return (science.transitDepthPpm ?? 0) >= 500;
    case 'rv-friendly':
      return (science.rvSemiAmplitude ?? 0) >= 1;
    case 'atmosphere-friendly':
      return (science.transmissionSignalPpm ?? 0) >= 20;
    default:
      return true;
  }
}

function applyFilters() {
  const query = elements.searchInput.value.trim().toLowerCase();
  const method = elements.methodFilter.value;
  const size = elements.sizeFilter.value;
  const era = elements.eraFilter.value;
  const science = elements.scienceFilter.value;

  state.filtered = state.planets.filter((planet) => {
    const matchesQuery = !query || `${planet.name} ${planet.host} ${planet.method} ${planet.facility}`.toLowerCase().includes(query);
    const matchesMethod = method === 'all' || planet.method === method;
    const matchesSize = size === 'all' || planet.sizeClass === size;
    const matchesEra = era === 'all' || discoveryEra(planet.discovery_year) === era;
    const matchesScience = scienceFilterMatch(planet, science);
    return matchesQuery && matchesMethod && matchesSize && matchesEra && matchesScience;
  });

  state.filtered = sortPlanets(state.filtered, elements.sortSelect.value);
  if (state.filtered.length && !state.filtered.some((planet) => planet.name === state.selectedName)) {
    state.selectedName = state.filtered[0].name;
  }
  renderExplorer();
  renderLab();
}

function populateMethodFilter() {
  const methods = [...new Set(state.planets.map((planet) => planet.method))].sort((a, b) => a.localeCompare(b));
  elements.methodFilter.innerHTML = '<option value="all">All methods</option>';
  for (const method of methods) {
    const option = document.createElement('option');
    option.value = method;
    option.textContent = method;
    elements.methodFilter.append(option);
  }
}

function populateLabSelect() {
  elements.labPlanetSelect.innerHTML = '';
  for (const planet of sortPlanets(state.planets, 'name-asc')) {
    const option = document.createElement('option');
    option.value = planet.name;
    option.textContent = `${planet.name} — ${planet.host}`;
    elements.labPlanetSelect.append(option);
  }
}

function renderStatus() {
  const mode = state.meta.mode ? `${state.meta.mode} dataset` : 'dataset';
  const generated = state.meta.generated_utc ? ` · generated ${state.meta.generated_utc}` : '';
  const source = state.meta.source ? ` · ${state.meta.source}` : '';
  elements.dataStatus.textContent = `${compactNumber(state.planets.length)} planets loaded from ${mode}${generated}${source}`;
}

function renderStats() {
  const methodCount = new Set(state.planets.map((planet) => planet.method)).size;
  const densityCount = state.planets.filter((planet) => isPositive(getDefaultScience(planet).density)).length;
  const hzCount = state.planets.filter((planet) => getDefaultScience(planet).hz.category !== 'unknown').length;

  elements.statPlanets.textContent = compactNumber(state.planets.length);
  elements.statMethods.textContent = compactNumber(methodCount);
  elements.statHz.textContent = compactNumber(hzCount);
  elements.statDensity.textContent = compactNumber(densityCount);
}

function renderBarChart(container, entries, options = {}) {
  const normalized = entries.map((entry) => Array.isArray(entry)
    ? { label: entry[0], count: entry[1], className: '' }
    : entry);
  const max = Math.max(...normalized.map((entry) => entry.count), 1);
  container.innerHTML = '';

  for (const entry of normalized) {
    const row = document.createElement('div');
    row.className = 'bar-row';

    const labelEl = document.createElement('span');
    labelEl.className = 'bar-label';
    labelEl.textContent = entry.label;

    const track = document.createElement('div');
    track.className = 'bar-track';
    const fill = document.createElement('div');
    fill.className = `bar-fill ${entry.className ?? ''}`.trim();
    fill.style.width = `${Math.max(entry.count === 0 ? 0 : 4, (entry.count / max) * 100)}%`;
    track.append(fill);

    const value = document.createElement('span');
    value.className = 'bar-value';
    value.textContent = options.percent
      ? `${formatNumber((entry.count / Math.max(state.planets.length, 1)) * 100, 1)}%`
      : compactNumber(entry.count);

    row.append(labelEl, track, value);
    container.append(row);
  }
}

function renderCharts() {
  const methodEntries = sortEntriesDescending(countBy(state.planets, (planet) => planet.method)).slice(0, 8);
  elements.methodChartNote.textContent = `${methodEntries.length} shown`;
  renderBarChart(elements.methodChart, methodEntries);

  const sizeOrder = ['Terrestrial', 'Super-Earth', 'Sub-Neptune', 'Giant', 'Super-Jupiter', 'Unknown'];
  const sizeCounts = countBy(state.planets, (planet) => planet.sizeClass);
  renderBarChart(elements.sizeChart, sizeOrder.map((label) => [label, sizeCounts.get(label) ?? 0]), { percent: true });

  renderTimelineChart();
  renderPhysicsMap();
  renderHzChart();
}

function renderTimelineChart() {
  const yearCounts = [...countBy(
    state.planets.filter((planet) => Number.isFinite(planet.discovery_year)),
    (planet) => planet.discovery_year,
  ).entries()].sort((a, b) => a[0] - b[0]);

  if (!yearCounts.length) {
    elements.timelineChart.innerHTML = '<div class="empty-state">No discovery years available.</div>';
    return;
  }

  const width = 760;
  const height = 265;
  const padding = { top: 24, right: 22, bottom: 42, left: 42 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxCount = Math.max(...yearCounts.map(([, count]) => count), 1);
  const barGap = 3;
  const barWidth = Math.max(3, (chartWidth / yearCounts.length) - barGap);
  const tickEvery = Math.max(1, Math.ceil(yearCounts.length / 7));

  const bars = yearCounts.map(([year, count], index) => {
    const x = padding.left + index * (barWidth + barGap);
    const barHeight = Math.max(2, (count / maxCount) * chartHeight);
    const y = padding.top + chartHeight - barHeight;
    return `<rect class="timeline-bar" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${barHeight.toFixed(2)}"><title>${year}: ${count} planets</title></rect>`;
  }).join('');

  const labels = yearCounts
    .filter((_, index) => index % tickEvery === 0 || index === yearCounts.length - 1)
    .map(([year]) => {
      const sourceIndex = yearCounts.findIndex(([candidate]) => candidate === year);
      const x = padding.left + sourceIndex * (barWidth + barGap) + barWidth / 2;
      return `<text class="timeline-label" x="${x.toFixed(2)}" y="${height - 12}" text-anchor="middle">${year}</text>`;
    }).join('');

  elements.timelineChart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="timelineGradient" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#6f8062" />
          <stop offset="100%" stop-color="#375f73" />
        </linearGradient>
      </defs>
      <line class="axis-line" x1="${padding.left}" y1="${padding.top + chartHeight}" x2="${width - padding.right}" y2="${padding.top + chartHeight}" />
      <text class="timeline-axis" x="${padding.left}" y="16">${maxCount} max/year</text>
      ${bars.replaceAll('class="timeline-bar"', 'class="timeline-bar" fill="url(#timelineGradient)"')}
      ${labels}
    </svg>
  `;
}

function logScale(value, min, max, size) {
  const safe = Math.max(value, min);
  return ((Math.log10(safe) - Math.log10(min)) / (Math.log10(max) - Math.log10(min))) * size;
}

function renderPhysicsMap() {
  const points = state.planets
    .map((planet) => ({ planet, science: getDefaultScience(planet) }))
    .filter(({ planet, science }) => isPositive(planet.radius_earth) && isPositive(science.insolation));

  if (!points.length) {
    elements.physicsMap.innerHTML = '<div class="empty-state">No radius/insolation pairs available.</div>';
    return;
  }

  const width = 760;
  const height = 330;
  const pad = { top: 26, right: 24, bottom: 54, left: 58 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const fluxValues = points.map(({ science }) => science.insolation);
  const radiusValues = points.map(({ planet }) => planet.radius_earth);
  const xMin = Math.max(0.02, Math.min(0.03, Math.min(...fluxValues) * 0.7));
  const xMax = Math.max(2000, Math.max(...fluxValues) * 1.3);
  const yMin = Math.max(0.2, Math.min(0.3, Math.min(...radiusValues) * 0.8));
  const yMax = Math.max(20, Math.max(...radiusValues) * 1.2);

  const bandX1 = pad.left + logScale(0.32, xMin, xMax, chartW);
  const bandX2 = pad.left + logScale(1.776, xMin, xMax, chartW);
  const bandWidth = Math.max(0, bandX2 - bandX1);

  const dots = points.slice(0, 1200).map(({ planet, science }) => {
    const x = pad.left + logScale(science.insolation, xMin, xMax, chartW);
    const y = pad.top + chartH - logScale(planet.radius_earth, yMin, yMax, chartH);
    const category = science.hz.category;
    const fill = category === 'conservative' || category === 'optimistic' ? '#6f8062' : category === 'hot' ? '#9b5b45' : category === 'cold' ? '#6f6a8d' : '#375f73';
    return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="4" fill="${fill}" class="scatter-dot"><title>${escapeHtml(planet.name)} — S=${formatNumber(science.insolation, 2)} S⊕, R=${formatNumber(planet.radius_earth, 2)} R⊕</title></circle>`;
  }).join('');

  elements.physicsMap.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" aria-hidden="true" focusable="false">
      <rect x="${bandX1.toFixed(2)}" y="${pad.top}" width="${bandWidth.toFixed(2)}" height="${chartH}" fill="rgba(111,128,98,0.16)" stroke="rgba(111,128,98,0.35)" />
      <line class="axis-line" x1="${pad.left}" y1="${pad.top + chartH}" x2="${width - pad.right}" y2="${pad.top + chartH}" />
      <line class="axis-line" x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + chartH}" />
      <text class="axis-label" x="${width / 2}" y="${height - 16}" text-anchor="middle">Incident flux, log scale (S⊕)</text>
      <text class="axis-label" x="18" y="${height / 2}" text-anchor="middle" transform="rotate(-90 18 ${height / 2})">Planet radius, log scale (R⊕)</text>
      <text class="svg-label" x="${bandX1 + 8}" y="${pad.top + 18}">optimistic HZ flux band</text>
      <text class="svg-label" x="${pad.left}" y="${height - 35}">${formatScientific(xMin, 1)}</text>
      <text class="svg-label" x="${width - pad.right}" y="${height - 35}" text-anchor="end">${formatScientific(xMax, 1)}</text>
      <text class="svg-label" x="${pad.left - 8}" y="${pad.top + chartH}" text-anchor="end">${formatNumber(yMin, 1)}</text>
      <text class="svg-label" x="${pad.left - 8}" y="${pad.top + 8}" text-anchor="end">${formatNumber(yMax, 1)}</text>
      ${dots}
    </svg>
  `;
}

function renderHzChart() {
  const labels = [
    { key: 'conservative', label: 'Conservative HZ', className: 'hz-good' },
    { key: 'optimistic', label: 'Optimistic HZ', className: 'hz-good' },
    { key: 'hot', label: 'Too irradiated', className: 'hz-hot' },
    { key: 'cold', label: 'Too little flux', className: 'hz-cold' },
    { key: 'unknown', label: 'Unknown', className: 'hz-unknown' },
  ];
  const counts = countBy(state.planets, (planet) => getDefaultScience(planet).hz.category);
  renderBarChart(elements.hzChart, labels.map((item) => ({
    label: item.label,
    count: counts.get(item.key) ?? 0,
    className: item.className,
  })));
}

function planetMetrics(planet) {
  return [
    ['Method', planet.method],
    ['Year', planet.discovery_year ?? 'Unknown'],
    ['Radius', planet.radius_earth === null ? 'Unknown' : `${formatNumber(planet.radius_earth)} R⊕`],
    ['Mass', planet.mass_earth === null ? 'Unknown' : `${formatNumber(planet.mass_earth)} M⊕`],
    ['Orbit', planet.orbital_period_days === null ? 'Unknown' : `${formatNumber(planet.orbital_period_days)} days`],
    ['Distance', planet.distance_pc === null ? 'Unknown' : `${formatNumber(planet.distance_pc, 1)} pc`],
    ['Star Teff', planet.stellar_temp_k === null ? 'Unknown' : `${formatNumber(planet.stellar_temp_k, 0)} K`],
    ['Facility', planet.facility],
  ];
}

function scienceMetrics(planet) {
  const science = getDefaultScience(planet);
  return [
    ['Flux', isPositive(science.insolation) ? `${formatNumber(science.insolation, 2)} S⊕` : 'Unknown'],
    ['HZ class', science.hz.label],
    ['Density', isPositive(science.density) ? `${formatNumber(science.density, 2)} g/cm³` : 'Unknown'],
    ['Transit', isPositive(science.transitDepthPpm) ? `${formatNumber(science.transitDepthPpm, 0)} ppm` : 'Unknown'],
    ['RV K', isPositive(science.rvSemiAmplitude) ? `${formatNumber(science.rvSemiAmplitude, 3)} m/s` : 'Unknown'],
    ['Composition', science.composition],
  ];
}

function createPlanetCard(planet) {
  const science = getDefaultScience(planet);
  const article = document.createElement('article');
  article.className = `planet-card${planet.name === state.selectedName ? ' is-selected' : ''}`;
  article.tabIndex = 0;
  article.setAttribute('role', 'button');
  article.setAttribute('aria-label', `Analyze ${planet.name}`);
  article.dataset.name = planet.name;

  const hzBadge = science.hz.category === 'conservative'
    ? 'Conservative HZ'
    : science.hz.category === 'optimistic'
      ? 'Optimistic HZ'
      : planet.sizeClass;
  const badgeClass = science.hz.category === 'hot' || science.hz.category === 'cold' ? 'warning' : '';

  article.innerHTML = `
    <div class="card-top">
      <div>
        <h3>${escapeHtml(planet.name)}</h3>
        <p class="host-name">Host: ${escapeHtml(planet.host)}</p>
      </div>
      <span class="badge ${badgeClass}">${escapeHtml(hzBadge)}</span>
    </div>
    <div class="card-metrics">
      <div class="metric"><span>Flux</span><strong>${isPositive(science.insolation) ? `${formatNumber(science.insolation, 2)} S⊕` : 'Unknown'}</strong></div>
      <div class="metric"><span>Density</span><strong>${isPositive(science.density) ? `${formatNumber(science.density, 2)} g/cm³` : 'Unknown'}</strong></div>
      <div class="metric"><span>Transit</span><strong>${isPositive(science.transitDepthPpm) ? `${formatNumber(science.transitDepthPpm, 0)} ppm` : 'Unknown'}</strong></div>
      <div class="metric"><span>RV K</span><strong>${isPositive(science.rvSemiAmplitude) ? `${formatNumber(science.rvSemiAmplitude, 3)} m/s` : 'Unknown'}</strong></div>
    </div>
  `;

  const select = () => {
    state.selectedName = planet.name;
    elements.labPlanetSelect.value = planet.name;
    renderExplorer();
    renderLab();
  };
  article.addEventListener('click', select);
  article.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      select();
    }
  });
  return article;
}

function renderExplorer() {
  const visiblePlanets = state.filtered.slice(0, state.visible);
  elements.resultCount.textContent = `${compactNumber(state.filtered.length)} matching planets`;
  elements.planetList.innerHTML = '';

  if (!visiblePlanets.length) {
    elements.planetList.innerHTML = '<div class="empty-state">No planets match the current filters. Try broadening your search.</div>';
  } else {
    for (const planet of visiblePlanets) {
      elements.planetList.append(createPlanetCard(planet));
    }
  }

  elements.loadMore.hidden = state.visible >= state.filtered.length;
  const selected = state.planets.find((planet) => planet.name === state.selectedName) ?? visiblePlanets[0] ?? null;
  if (selected && state.selectedName !== selected.name) state.selectedName = selected.name;
  if (selected) elements.labPlanetSelect.value = selected.name;
  renderDetail(selected);
}

function renderDetail(planet) {
  if (!planet) {
    elements.detailTitle.textContent = 'No planet selected';
    elements.detailSubtitle.textContent = 'Choose a planet card to view measured and derived properties.';
    elements.detailList.innerHTML = '';
    elements.detailScienceList.innerHTML = '';
    elements.detailDescription.textContent = '';
    return;
  }

  elements.detailTitle.textContent = planet.name;
  elements.detailSubtitle.textContent = `${planet.host} · ${planet.sizeClass} · ${planet.method}`;
  elements.detailList.innerHTML = planetMetrics(planet).map(([label, value]) => `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(String(value))}</dd>
    </div>
  `).join('');
  elements.detailScienceList.innerHTML = scienceMetrics(planet).map(([label, value]) => `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(String(value))}</dd>
    </div>
  `).join('');
  elements.detailDescription.textContent = planet.description || 'No curated description is available for this record. Refreshing from NASA TAP preserves core physical and discovery fields.';
}

function selectedPlanet() {
  return state.planets.find((planet) => planet.name === state.selectedName) ?? state.planets[0] ?? null;
}

function renderLab() {
  const planet = selectedPlanet();
  elements.albedoOutput.textContent = Number(elements.albedoSlider.value).toFixed(2);
  elements.scaleHeightsOutput.textContent = elements.scaleHeightsInput.value;

  if (!planet) {
    elements.labTitle.textContent = 'No planet selected';
    elements.labSubtitle.textContent = 'Load a dataset first.';
    elements.labVerdict.textContent = 'No target available.';
    elements.derivedMetrics.innerHTML = '';
    elements.hzGraphic.innerHTML = '';
    elements.transitGraphic.innerHTML = '';
    elements.rvGraphic.innerHTML = '';
    elements.massRadiusGraphic.innerHTML = '';
    elements.labCaveats.textContent = '';
    return;
  }

  const assumptions = getLabAssumptions();
  const science = derivePlanetScience(planet, assumptions);

  elements.labTitle.textContent = planet.name;
  elements.labSubtitle.textContent = `${planet.host} · ${planet.method} · ${planet.discovery_year ?? 'year unknown'}`;
  elements.labVerdict.className = `verdict ${science.hz.className ?? 'unknown'}`;
  elements.labVerdict.textContent = science.hz.label;

  renderDerivedMetrics(planet, science);
  renderHzGraphic(planet, science);
  renderTransitGraphic(planet, science);
  renderRvGraphic(planet, science);
  renderMassRadiusGraphic(planet, science);
  renderCaveats(science);
}

function renderDerivedMetrics(planet, science) {
  const cmf = science.coreMassFraction;
  const metrics = [
    ['Incident flux', isPositive(science.insolation) ? `${formatNumber(science.insolation, 3)} S⊕` : 'Unknown', 'Luminosity divided by orbit squared'],
    ['Model T_eq', isPositive(science.modelEquilibriumTemp) ? `${formatNumber(science.modelEquilibriumTemp, 0)} K` : 'Unknown', `albedo ${Number(elements.albedoSlider.value).toFixed(2)}`],
    ['Bulk density', isPositive(science.density) ? `${formatNumber(science.density, 2)} g/cm³` : 'Unknown', science.composition],
    ['Surface gravity', isPositive(science.surfaceGravityEarth) ? `${formatNumber(science.surfaceGravityEarth, 2)} g⊕` : 'Unknown', isPositive(science.escapeVelocity) ? `vesc ${formatNumber(science.escapeVelocity, 2)} km/s` : 'escape unknown'],
    ['Transit depth', isPositive(science.transitDepthPpm) ? `${formatNumber(science.transitDepthPpm, 0)} ppm` : 'Unknown', isPositive(science.transitDurationHours) ? `central duration ≈ ${formatNumber(science.transitDurationHours, 2)} h` : 'duration unknown'],
    ['RV semi-amplitude', isPositive(science.rvSemiAmplitude) ? `${formatNumber(science.rvSemiAmplitude, 3)} m/s` : 'Unknown', 'edge-on unless inclination is known'],
    ['Transmission proxy', isPositive(science.transmissionSignalPpm) ? `${formatNumber(science.transmissionSignalPpm, 1)} ppm` : 'Unknown', isPositive(science.scaleHeightKm) ? `H ≈ ${formatNumber(science.scaleHeightKm, 1)} km` : 'scale height unknown'],
    ['Astrometric wobble', isPositive(science.astrometricAmplitudeMicroArcsec) ? `${formatNumber(science.astrometricAmplitudeMicroArcsec, 3)} µas` : 'Unknown', 'maximum angular reflex signal'],
    ['Stellar luminosity', isPositive(science.stellarLuminosity) ? `${formatScientific(science.stellarLuminosity, 2)} L☉` : 'Unknown', isPositive(science.stellarRadius) ? `R★ ${formatNumber(science.stellarRadius, 2)} R☉` : 'radius unknown'],
    ['Semi-major axis', isPositive(science.semiMajor) ? `${formatNumber(science.semiMajor, 4)} AU` : 'Unknown', planet.orbital_period_days ? `P ${formatNumber(planet.orbital_period_days, 3)} d` : 'period unknown'],
    ['Rocky CMF proxy', cmf === null ? 'Not applicable' : `${formatNumber(cmf * 100, 1)}%`, 'valid mainly for 1–8 M⊕ rocky planets'],
    ['Archive T_eq', isPositive(planet.equilibrium_temp_k) ? `${formatNumber(planet.equilibrium_temp_k, 0)} K` : 'Unknown', 'literature/archive field'],
  ];

  elements.derivedMetrics.innerHTML = metrics.map(([label, value, note]) => `
    <div class="derived-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(note)}</small>
    </div>
  `).join('');
}

function renderHzGraphic(planet, science) {
  if (!science.hz.distances || !isPositive(science.semiMajor)) {
    elements.hzGraphic.innerHTML = '<div class="empty-state">Habitable-zone graphic needs stellar luminosity and orbital distance.</div>';
    return;
  }

  const width = 720;
  const height = 250;
  const pad = { top: 32, right: 28, bottom: 54, left: 50 };
  const chartW = width - pad.left - pad.right;
  const y = height / 2;
  const distances = science.hz.distances;
  const maxDistance = Math.max(distances.optimisticOuter, science.semiMajor) * 1.25;
  const minDistance = Math.max(0.005, Math.min(distances.optimisticInner, science.semiMajor) * 0.65);
  const xFor = (distance) => pad.left + logScale(distance, minDistance, maxDistance, chartW);
  const optX1 = xFor(distances.optimisticInner);
  const optX2 = xFor(distances.optimisticOuter);
  const conX1 = xFor(distances.conservativeInner);
  const conX2 = xFor(distances.conservativeOuter);
  const planetX = xFor(science.semiMajor);

  elements.hzGraphic.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" aria-hidden="true" focusable="false">
      <line class="axis-line" x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" />
      <circle cx="${pad.left}" cy="${y}" r="16" fill="#b67b32" />
      <rect class="hz-band-optimistic" x="${optX1}" y="${y - 48}" width="${optX2 - optX1}" height="96" rx="18" />
      <rect class="hz-band-conservative" x="${conX1}" y="${y - 32}" width="${conX2 - conX1}" height="64" rx="14" />
      <line class="orbit-line" x1="${planetX}" y1="${y - 66}" x2="${planetX}" y2="${y + 66}" />
      <circle class="planet-marker" cx="${planetX}" cy="${y}" r="8"><title>${escapeHtml(planet.name)} orbit: ${formatNumber(science.semiMajor, 4)} AU</title></circle>
      <text class="svg-label" x="${optX1}" y="${y - 62}">optimistic</text>
      <text class="svg-label" x="${conX1}" y="${y - 39}">conservative</text>
      <text class="svg-label" x="${planetX}" y="${y + 86}" text-anchor="middle">${formatNumber(science.semiMajor, 4)} AU</text>
      <text class="svg-label" x="${pad.left}" y="${height - 16}">${formatNumber(minDistance, 3)} AU</text>
      <text class="svg-label" x="${width - pad.right}" y="${height - 16}" text-anchor="end">${formatNumber(maxDistance, 2)} AU</text>
    </svg>
  `;
}

function renderTransitGraphic(planet, science) {
  if (!isPositive(science.transitDepthPpm)) {
    elements.transitGraphic.innerHTML = '<div class="empty-state">Transit model needs planet radius and stellar radius.</div>';
    return;
  }
  const width = 720;
  const height = 250;
  const pad = { top: 28, right: 28, bottom: 46, left: 52 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const depth = science.transitDepthPpm / 1_000_000;
  const visualDepth = Math.min(0.5, Math.max(0.045, Math.sqrt(depth) * 1.35));
  const baselineY = pad.top + chartH * 0.28;
  const dipY = baselineY + chartH * visualDepth;
  const ingress = pad.left + chartW * 0.38;
  const egress = pad.left + chartW * 0.62;
  const path = [
    `M ${pad.left} ${baselineY}`,
    `L ${ingress - 30} ${baselineY}`,
    `C ${ingress - 12} ${baselineY}, ${ingress - 8} ${dipY}, ${ingress} ${dipY}`,
    `L ${egress} ${dipY}`,
    `C ${egress + 8} ${dipY}, ${egress + 12} ${baselineY}, ${egress + 30} ${baselineY}`,
    `L ${width - pad.right} ${baselineY}`,
  ].join(' ');

  elements.transitGraphic.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" aria-hidden="true" focusable="false">
      <line class="grid-line" x1="${pad.left}" y1="${baselineY}" x2="${width - pad.right}" y2="${baselineY}" />
      <path class="transit-line" d="${path}" />
      <line class="axis-line" x1="${pad.left}" y1="${pad.top + chartH}" x2="${width - pad.right}" y2="${pad.top + chartH}" />
      <text class="svg-label" x="${pad.left}" y="18">Normalized stellar flux</text>
      <text class="svg-label" x="${width / 2}" y="${height - 12}" text-anchor="middle">Orbital phase around transit</text>
      <text class="svg-label" x="${width - pad.right}" y="${dipY + 20}" text-anchor="end">depth ≈ ${formatNumber(science.transitDepthPpm, 0)} ppm</text>
      <text class="svg-label" x="${width - pad.right}" y="${dipY + 38}" text-anchor="end">duration ≈ ${isPositive(science.transitDurationHours) ? `${formatNumber(science.transitDurationHours, 2)} h` : 'unknown'}</text>
    </svg>
  `;
}

function renderRvGraphic(planet, science) {
  if (!isPositive(science.rvSemiAmplitude)) {
    elements.rvGraphic.innerHTML = '<div class="empty-state">RV curve needs planet mass, period, and stellar mass.</div>';
    return;
  }
  const width = 720;
  const height = 250;
  const pad = { top: 30, right: 28, bottom: 46, left: 54 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const midY = pad.top + chartH / 2;
  const ampY = chartH * 0.38;
  const points = Array.from({ length: 90 }, (_, index) => {
    const phase = index / 89;
    const x = pad.left + phase * chartW;
    const y = midY - Math.sin(phase * Math.PI * 2) * ampY;
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');

  elements.rvGraphic.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" aria-hidden="true" focusable="false">
      <line class="grid-line" x1="${pad.left}" y1="${midY}" x2="${width - pad.right}" y2="${midY}" />
      <path class="rv-line" d="${points}" />
      <text class="svg-label" x="${pad.left}" y="18">Radial velocity relative to system barycenter</text>
      <text class="svg-label" x="${width / 2}" y="${height - 12}" text-anchor="middle">Orbital phase</text>
      <text class="svg-label" x="${width - pad.right}" y="${pad.top + 20}" text-anchor="end">K ≈ ${formatNumber(science.rvSemiAmplitude, 3)} m/s</text>
      <text class="svg-label" x="${width - pad.right}" y="${pad.top + 38}" text-anchor="end">P ≈ ${isPositive(planet.orbital_period_days) ? `${formatNumber(planet.orbital_period_days, 3)} d` : 'unknown'}</text>
    </svg>
  `;
}

function renderMassRadiusGraphic(selectedPlanet, selectedScience) {
  const candidates = state.planets.filter((planet) => isPositive(planet.mass_earth) && isPositive(planet.radius_earth));
  if (!candidates.length) {
    elements.massRadiusGraphic.innerHTML = '<div class="empty-state">Mass-radius diagram needs planet mass and radius.</div>';
    return;
  }

  const width = 720;
  const height = 250;
  const pad = { top: 28, right: 28, bottom: 48, left: 56 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const xMin = 0.3;
  const xMax = 24;
  const yMin = 0.05;
  const yMax = 5000;
  const xFor = (radius) => pad.left + logScale(radius, xMin, xMax, chartW);
  const yFor = (mass) => pad.top + chartH - logScale(mass, yMin, yMax, chartH);

  const dots = candidates.slice(0, 1200).map((planet) => {
    const isSelected = planet.name === selectedPlanet.name;
    const x = xFor(planet.radius_earth);
    const y = yFor(planet.mass_earth);
    const radius = isSelected ? 8 : 3.5;
    const fill = isSelected ? '#b67b32' : 'rgba(55,95,115,0.72)';
    return `<circle class="mr-dot" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${radius}" fill="${fill}" stroke="${isSelected ? '#242018' : 'rgba(36,32,24,0.32)'}"><title>${escapeHtml(planet.name)} — ${formatNumber(planet.mass_earth, 2)} M⊕, ${formatNumber(planet.radius_earth, 2)} R⊕</title></circle>`;
  }).join('');

  const modelMasses = [0.1, 0.2, 0.5, 1, 2, 5, 8, 10];
  const earthLike = modelMasses.map((mass, index) => {
    const radius = (1.07 - 0.21 * 0.33) * Math.pow(mass, 1 / 3.7);
    return `${index === 0 ? 'M' : 'L'} ${xFor(radius).toFixed(2)} ${yFor(mass).toFixed(2)}`;
  }).join(' ');
  const pureSilicate = modelMasses.map((mass, index) => {
    const radius = 1.07 * Math.pow(mass, 1 / 3.7);
    return `${index === 0 ? 'M' : 'L'} ${xFor(radius).toFixed(2)} ${yFor(mass).toFixed(2)}`;
  }).join(' ');

  elements.massRadiusGraphic.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" aria-hidden="true" focusable="false">
      <line class="axis-line" x1="${pad.left}" y1="${pad.top + chartH}" x2="${width - pad.right}" y2="${pad.top + chartH}" />
      <line class="axis-line" x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + chartH}" />
      <path class="model-line" d="${pureSilicate}" />
      <path class="model-line" d="${earthLike}" />
      ${dots}
      <text class="svg-label" x="${width / 2}" y="${height - 12}" text-anchor="middle">Radius (R⊕, log)</text>
      <text class="svg-label" x="17" y="${height / 2}" text-anchor="middle" transform="rotate(-90 17 ${height / 2})">Mass (M⊕, log)</text>
      <text class="svg-label" x="${pad.left + 10}" y="${pad.top + 16}">dashed: rocky-composition guide curves</text>
      <text class="svg-label" x="${width - pad.right}" y="${pad.top + 18}" text-anchor="end">${selectedScience.composition}</text>
    </svg>
  `;
}

function renderCaveats(science) {
  const baseNotes = [
    'Transit duration assumes a circular, central transit and ignores limb darkening.',
    'RV amplitude uses a simplified Keplerian semi-amplitude and assumes sin(i)=1 when inclination is unknown.',
    'Transmission signal is a scale-height proxy, not an atmospheric retrieval or detectability guarantee.',
  ];
  const notes = [...new Set([...science.notes, ...baseNotes])];
  elements.labCaveats.innerHTML = `
    <strong>Assumptions and caveats</strong>
    <ul>${notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function wireEvents() {
  elements.navToggle.addEventListener('click', () => {
    const isOpen = elements.navLinks.classList.toggle('is-open');
    elements.navToggle.setAttribute('aria-expanded', String(isOpen));
  });

  elements.navLinks.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      elements.navLinks.classList.remove('is-open');
      elements.navToggle.setAttribute('aria-expanded', 'false');
    });
  });

  window.addEventListener('scroll', () => {
    elements.header.dataset.elevated = String(window.scrollY > 8);
  }, { passive: true });

  [elements.searchInput, elements.methodFilter, elements.sizeFilter, elements.scienceFilter, elements.eraFilter, elements.sortSelect]
    .forEach((control) => control.addEventListener('input', () => {
      state.visible = PAGE_SIZE;
      applyFilters();
    }));

  elements.resetFilters.addEventListener('click', () => {
    elements.searchInput.value = '';
    elements.methodFilter.value = 'all';
    elements.sizeFilter.value = 'all';
    elements.scienceFilter.value = 'all';
    elements.eraFilter.value = 'all';
    elements.sortSelect.value = 'name-asc';
    state.visible = PAGE_SIZE;
    applyFilters();
  });

  elements.loadMore.addEventListener('click', () => {
    state.visible += PAGE_SIZE;
    renderExplorer();
  });

  elements.labPlanetSelect.addEventListener('input', () => {
    state.selectedName = elements.labPlanetSelect.value;
    renderExplorer();
    renderLab();
  });

  [elements.albedoSlider, elements.atmosphereSelect, elements.scaleHeightsInput]
    .forEach((control) => control.addEventListener('input', renderLab));
}

async function loadData() {
  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    state.meta = payload.meta ?? {};
    state.planets = (payload.planets ?? payload)
      .map(normalizePlanet)
      .filter((planet) => planet.name);

    if (!state.planets.length) throw new Error('Dataset contains no planet records.');

    populateMethodFilter();
    populateLabSelect();
    renderStatus();
    renderStats();
    renderCharts();
    state.filtered = sortPlanets(state.planets, elements.sortSelect.value);
    state.selectedName = state.filtered[0]?.name ?? null;
    if (state.selectedName) elements.labPlanetSelect.value = state.selectedName;
    renderExplorer();
    renderLab();
  } catch (error) {
    elements.dataStatus.textContent = `Could not load ${DATA_URL}. Use a local web server, not file://.`;
    elements.planetList.innerHTML = `<div class="error-state">Dataset loading failed: ${escapeHtml(error.message)}</div>`;
    elements.resultCount.textContent = 'Dataset unavailable';
    console.error(error);
  }
}

wireEvents();
loadData();
