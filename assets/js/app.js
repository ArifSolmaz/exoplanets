const DATA_URL = './data/exoplanets.json';
const PAGE_SIZE = 12;

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
  statPlanetsNote: document.querySelector('#statPlanetsNote'),
  statMethods: document.querySelector('#statMethods'),
  statRocky: document.querySelector('#statRocky'),
  statLatest: document.querySelector('#statLatest'),
  statDistance: document.querySelector('#statDistance'),
  methodChart: document.querySelector('#methodChart'),
  methodChartNote: document.querySelector('#methodChartNote'),
  timelineChart: document.querySelector('#timelineChart'),
  sizeChart: document.querySelector('#sizeChart'),
  searchInput: document.querySelector('#searchInput'),
  methodFilter: document.querySelector('#methodFilter'),
  sizeFilter: document.querySelector('#sizeFilter'),
  eraFilter: document.querySelector('#eraFilter'),
  sortSelect: document.querySelector('#sortSelect'),
  resetFilters: document.querySelector('#resetFilters'),
  resultCount: document.querySelector('#resultCount'),
  planetList: document.querySelector('#planetList'),
  loadMore: document.querySelector('#loadMore'),
  detailTitle: document.querySelector('#detailTitle'),
  detailSubtitle: document.querySelector('#detailSubtitle'),
  detailList: document.querySelector('#detailList'),
  detailDescription: document.querySelector('#detailDescription'),
};

function compactNumber(value) {
  return new Intl.NumberFormat('en', { notation: value >= 10000 ? 'compact' : 'standard' }).format(value);
}

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'Unknown';
  const numeric = Number(value);
  if (Math.abs(numeric) >= 1000) return new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(numeric);
  if (Math.abs(numeric) >= 100) return new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(numeric);
  return new Intl.NumberFormat('en', { maximumFractionDigits: digits }).format(numeric);
}

function asNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
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
  const radius = asNumber(raw.radius_earth ?? raw.pl_rade);
  const mass = asNumber(raw.mass_earth ?? raw.pl_bmasse);
  const period = asNumber(raw.orbital_period_days ?? raw.pl_orbper);
  const distance = asNumber(raw.distance_pc ?? raw.sy_dist);
  const year = asNumber(raw.discovery_year ?? raw.disc_year);
  const stellarTemp = asNumber(raw.stellar_temp_k ?? raw.st_teff);

  return {
    name: normalizeText(raw.name ?? raw.pl_name, ''),
    host: normalizeText(raw.host ?? raw.hostname),
    method: normalizeText(raw.method ?? raw.discoverymethod),
    discovery_year: year,
    facility: normalizeText(raw.facility ?? raw.disc_facility),
    radius_earth: radius,
    mass_earth: mass,
    orbital_period_days: period,
    distance_pc: distance,
    stellar_temp_k: stellarTemp,
    equilibrium_temp_k: asNumber(raw.equilibrium_temp_k ?? raw.pl_eqt),
    semi_major_axis_au: asNumber(raw.semi_major_axis_au ?? raw.pl_orbsmax),
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

function sortPlanets(planets, sortMode) {
  const copy = [...planets];
  const unknownLast = (a, b, selector) => {
    const av = selector(a);
    const bv = selector(b);
    if (av === null && bv === null) return a.name.localeCompare(b.name);
    if (av === null) return 1;
    if (bv === null) return -1;
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
    case 'name-asc':
    default:
      return copy.sort((a, b) => a.name.localeCompare(b.name));
  }
}

function applyFilters() {
  const search = elements.searchInput.value.trim().toLowerCase();
  const method = elements.methodFilter.value;
  const size = elements.sizeFilter.value;
  const era = elements.eraFilter.value;

  const filtered = state.planets.filter((planet) => {
    const matchesSearch = !search || `${planet.name} ${planet.host}`.toLowerCase().includes(search);
    const matchesMethod = method === 'all' || planet.method === method;
    const matchesSize = size === 'all' || planet.sizeClass === size;
    const matchesEra = era === 'all' || discoveryEra(planet.discovery_year) === era;
    return matchesSearch && matchesMethod && matchesSize && matchesEra;
  });

  state.filtered = sortPlanets(filtered, elements.sortSelect.value);
  const selectedStillVisible = state.filtered.some((planet) => planet.name === state.selectedName);
  if (!selectedStillVisible) state.selectedName = state.filtered[0]?.name ?? null;
  renderExplorer();
}

function populateMethodFilter() {
  const methods = [...new Set(state.planets.map((planet) => planet.method).filter(Boolean))].sort();
  for (const method of methods) {
    const option = document.createElement('option');
    option.value = method;
    option.textContent = method;
    elements.methodFilter.append(option);
  }
}

function renderStatus() {
  const mode = state.meta.mode ?? 'unknown';
  const source = state.meta.source ?? 'local JSON dataset';
  const generated = state.meta.generated_utc ?? state.meta.generated ?? 'unknown date';
  const count = state.planets.length;
  const prefix = mode === 'seed' ? 'Seed dataset' : 'NASA TAP dataset';

  elements.dataStatus.textContent = `${prefix}: ${compactNumber(count)} records from ${source}. Generated: ${generated}.`;
  elements.statPlanetsNote.textContent = mode === 'seed'
    ? 'seed records; run the updater for the full archive'
    : 'records loaded from the generated JSON catalog';
}

function renderStats() {
  const methodCount = new Set(state.planets.map((planet) => planet.method)).size;
  const rockyCount = state.planets.filter((planet) => planet.radius_earth !== null && planet.radius_earth <= 2).length;
  const latestYear = Math.max(...state.planets.map((planet) => planet.discovery_year ?? -Infinity));
  const medianDistance = median(state.planets.map((planet) => planet.distance_pc));

  elements.statPlanets.textContent = compactNumber(state.planets.length);
  elements.statMethods.textContent = compactNumber(methodCount);
  elements.statRocky.textContent = compactNumber(rockyCount);
  elements.statLatest.textContent = Number.isFinite(latestYear) ? latestYear : '—';
  elements.statDistance.textContent = medianDistance === null
    ? 'median distance unavailable'
    : `median distance: ${formatNumber(medianDistance, 1)} pc`;
}

function renderBarChart(container, entries, options = {}) {
  const max = Math.max(...entries.map(([, count]) => count), 1);
  container.innerHTML = '';

  for (const [label, count] of entries) {
    const row = document.createElement('div');
    row.className = 'bar-row';

    const labelEl = document.createElement('span');
    labelEl.className = 'bar-label';
    labelEl.textContent = label;

    const track = document.createElement('div');
    track.className = 'bar-track';
    const fill = document.createElement('div');
    fill.className = 'bar-fill';
    fill.style.width = `${Math.max(4, (count / max) * 100)}%`;
    track.append(fill);

    const value = document.createElement('span');
    value.className = 'bar-value';
    value.textContent = options.percent
      ? `${formatNumber((count / state.planets.length) * 100, 1)}%`
      : compactNumber(count);

    row.append(labelEl, track, value);
    container.append(row);
  }
}

function renderCharts() {
  const methodEntries = sortEntriesDescending(countBy(state.planets, (planet) => planet.method)).slice(0, 7);
  elements.methodChartNote.textContent = `${methodEntries.length} shown`;
  renderBarChart(elements.methodChart, methodEntries);

  const sizeOrder = ['Terrestrial', 'Super-Earth', 'Sub-Neptune', 'Giant', 'Super-Jupiter', 'Unknown'];
  const sizeCounts = countBy(state.planets, (planet) => planet.sizeClass);
  renderBarChart(elements.sizeChart, sizeOrder.map((label) => [label, sizeCounts.get(label) ?? 0]), { percent: true });

  renderTimelineChart();
}

function renderTimelineChart() {
  const yearCounts = sortEntriesDescending(countBy(
    state.planets.filter((planet) => Number.isFinite(planet.discovery_year)),
    (planet) => planet.discovery_year,
  )).sort((a, b) => a[0] - b[0]);

  if (!yearCounts.length) {
    elements.timelineChart.innerHTML = '<div class="empty-state">No discovery years available.</div>';
    return;
  }

  const width = 760;
  const height = 265;
  const padding = { top: 24, right: 20, bottom: 42, left: 38 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxCount = Math.max(...yearCounts.map(([, count]) => count), 1);
  const barGap = 3;
  const barWidth = Math.max(3, (chartWidth / yearCounts.length) - barGap);
  const tickEvery = Math.max(1, Math.ceil(yearCounts.length / 6));

  const bars = yearCounts.map(([year, count], index) => {
    const x = padding.left + index * (barWidth + barGap);
    const barHeight = Math.max(2, (count / maxCount) * chartHeight);
    const y = padding.top + chartHeight - barHeight;
    return `<rect class="timeline-bar" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${barHeight.toFixed(2)}"><title>${year}: ${count} planets</title></rect>`;
  }).join('');

  const labels = yearCounts
    .filter((_, index) => index % tickEvery === 0 || index === yearCounts.length - 1)
    .map(([year], index) => {
      const sourceIndex = yearCounts.findIndex(([candidate]) => candidate === year);
      const x = padding.left + sourceIndex * (barWidth + barGap) + barWidth / 2;
      return `<text class="timeline-label" x="${x.toFixed(2)}" y="${height - 12}" text-anchor="middle">${year}</text>`;
    }).join('');

  elements.timelineChart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="timelineGradient" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#9af7d7" />
          <stop offset="100%" stop-color="#6be7ff" />
        </linearGradient>
      </defs>
      <line x1="${padding.left}" y1="${padding.top + chartHeight}" x2="${width - padding.right}" y2="${padding.top + chartHeight}" stroke="rgba(238, 246, 255, 0.24)" />
      <text class="timeline-axis" x="${padding.left}" y="16">${maxCount} max/year</text>
      ${bars}
      ${labels}
    </svg>
  `;
}

function planetMetrics(planet) {
  return [
    ['Method', planet.method],
    ['Year', planet.discovery_year ?? 'Unknown'],
    ['Radius', planet.radius_earth === null ? 'Unknown' : `${formatNumber(planet.radius_earth)} R⊕`],
    ['Mass', planet.mass_earth === null ? 'Unknown' : `${formatNumber(planet.mass_earth)} M⊕`],
    ['Orbit', planet.orbital_period_days === null ? 'Unknown' : `${formatNumber(planet.orbital_period_days)} days`],
    ['Distance', planet.distance_pc === null ? 'Unknown' : `${formatNumber(planet.distance_pc, 1)} pc`],
    ['Star temp.', planet.stellar_temp_k === null ? 'Unknown' : `${formatNumber(planet.stellar_temp_k, 0)} K`],
    ['Facility', planet.facility],
  ];
}

function createPlanetCard(planet) {
  const article = document.createElement('article');
  article.className = `planet-card${planet.name === state.selectedName ? ' is-selected' : ''}`;
  article.tabIndex = 0;
  article.setAttribute('role', 'button');
  article.setAttribute('aria-label', `View details for ${planet.name}`);
  article.dataset.name = planet.name;

  article.innerHTML = `
    <div class="card-top">
      <div>
        <h3>${escapeHtml(planet.name)}</h3>
        <p class="host-name">Host: ${escapeHtml(planet.host)}</p>
      </div>
      <span class="badge">${escapeHtml(planet.sizeClass)}</span>
    </div>
    <div class="card-metrics">
      <div class="metric"><span>Method</span><strong>${escapeHtml(planet.method)}</strong></div>
      <div class="metric"><span>Discovered</span><strong>${planet.discovery_year ?? 'Unknown'}</strong></div>
      <div class="metric"><span>Radius</span><strong>${planet.radius_earth === null ? 'Unknown' : `${formatNumber(planet.radius_earth)} R⊕`}</strong></div>
      <div class="metric"><span>Orbit</span><strong>${planet.orbital_period_days === null ? 'Unknown' : `${formatNumber(planet.orbital_period_days)} d`}</strong></div>
    </div>
  `;

  const select = () => {
    state.selectedName = planet.name;
    renderExplorer();
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
  renderDetail(selected);
}

function renderDetail(planet) {
  if (!planet) {
    elements.detailTitle.textContent = 'No planet selected';
    elements.detailSubtitle.textContent = 'Choose a planet card to view physical and orbital properties.';
    elements.detailList.innerHTML = '';
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
  elements.detailDescription.textContent = planet.description || 'No curated description is available for this record. Refreshing from NASA TAP preserves core physical and discovery fields.';
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

  window.addEventListener('scroll', () => {
    elements.header.dataset.elevated = String(window.scrollY > 8);
  }, { passive: true });

  [elements.searchInput, elements.methodFilter, elements.sizeFilter, elements.eraFilter, elements.sortSelect]
    .forEach((control) => control.addEventListener('input', () => {
      state.visible = PAGE_SIZE;
      applyFilters();
    }));

  elements.resetFilters.addEventListener('click', () => {
    elements.searchInput.value = '';
    elements.methodFilter.value = 'all';
    elements.sizeFilter.value = 'all';
    elements.eraFilter.value = 'all';
    elements.sortSelect.value = 'name-asc';
    state.visible = PAGE_SIZE;
    applyFilters();
  });

  elements.loadMore.addEventListener('click', () => {
    state.visible += PAGE_SIZE;
    renderExplorer();
  });
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
    renderStatus();
    renderStats();
    renderCharts();
    state.filtered = sortPlanets(state.planets, elements.sortSelect.value);
    state.selectedName = state.filtered[0]?.name ?? null;
    renderExplorer();
  } catch (error) {
    elements.dataStatus.textContent = `Could not load ${DATA_URL}. Use a local web server, not file://.`;
    elements.planetList.innerHTML = `<div class="error-state">Dataset loading failed: ${escapeHtml(error.message)}</div>`;
    elements.resultCount.textContent = 'Dataset unavailable';
    console.error(error);
  }
}

wireEvents();
loadData();
