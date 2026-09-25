/**
 * TrainTracker Fully Database-Driven Dashboard Controller
 * Connects approved UI to real PostgreSQL REST APIs.
 */

let allStationsList = [];
let stationAutocompleteAbortController = null;
let stationAutocompleteDebounceTimer = null;
let selectedTimeFilter = null; // State for View Trains time picker
const liveTrackState = {
  trainRef: null,
  data: null,
  serverOffsetMs: 0,
  refreshTimer: null,
  animationFrame: null,
  currentIconY: null,
  userScrolledAt: 0,
};
const DEFAULT_ADMIN_GRAPH_CANVAS = { width: 1180, height: 760 };
const ADMIN_REGION_ORDER = ['SR', 'CR', 'NR'];
const adminState = {
  token: localStorage.getItem('adminToken') || null,
  graph: null,
  route: null,
  selectedSource: 'MAS',
  selectedDestination: 'NDLS',
  autoRouteAttempted: false,
  viewBox: { x: 0, y: 0, w: DEFAULT_ADMIN_GRAPH_CANVAS.width, h: DEFAULT_ADMIN_GRAPH_CANVAS.height },
  graphCanvas: { ...DEFAULT_ADMIN_GRAPH_CANVAS },
  draggingNode: null,
  panning: null,
  nodePositions: new Map(),
};

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initSearchTrainsSection();
  initViewTrainsSection();
  initSearchStationsSection();
  initLiveTrackSection();
  initAdminModal();
  initMobileDrawer();

  // Check URL hash for initial deep links (e.g., #live-track?trainId=...)
  handleUrlHashRouting();
});

/* ==========================================================================
   Navigation & Routing Handler
   ========================================================================== */
function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach((item) => {
    item.addEventListener('click', () => {
      const targetViewId = item.getAttribute('data-view');
      switchView(targetViewId);
    });
  });

  window.addEventListener('hashchange', handleUrlHashRouting);
}

function switchView(targetViewId) {
  const navItems = document.querySelectorAll('.nav-item');
  const pageViews = document.querySelectorAll('.page-view');

  navItems.forEach((nav) => {
    if (nav.getAttribute('data-view') === targetViewId) {
      nav.classList.add('active');
    } else {
      nav.classList.remove('active');
    }
  });

  pageViews.forEach((view) => {
    if (view.id === targetViewId) {
      view.classList.remove('hidden');
      view.classList.add('active-view');
    } else {
      view.classList.add('hidden');
      view.classList.remove('active-view');
    }
  });

  closeMobileDrawer();
}

function handleUrlHashRouting() {
  const hash = window.location.hash || '';
  if (hash.startsWith('#live-track')) {
    switchView('view-live-track');
    const params = new URLSearchParams(hash.split('?')[1] || '');
    const trainId = params.get('trainId');
    if (trainId) {
      loadLiveTrackData(trainId);
    }
  }
}

/* ==========================================================================
   1. SEARCH TRAINS SECTION
   ========================================================================== */
function initSearchTrainsSection() {
  const form = document.getElementById('train-search-form');
  const fromInput = document.getElementById('from-station');
  const toInput = document.getElementById('to-station');
  const swapBtn = document.getElementById('swap-btn');
  const validationBox = document.getElementById('search-validation');
  const validationText = document.getElementById('validation-text');

  // Default State: Fetch and display next 3 upcoming trains from DB
  fetchUpcomingTrains();

  // Swap Stations button
  swapBtn.addEventListener('click', () => {
    const temp = fromInput.value;
    fromInput.value = toInput.value;
    toInput.value = temp;
    if (validationBox) validationBox.classList.add('hidden');
    swapBtn.style.transform = 'translateY(-50%) rotate(180deg)';
    setTimeout(() => {
      swapBtn.style.transform = 'translateY(-50%) rotate(0deg)';
    }, 200);
  });

  // Autocomplete setup
  setupStationAutocomplete(fromInput, 'from-suggestions');
  setupStationAutocomplete(toInput, 'to-suggestions');

  // Form submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fromVal = fromInput.value.trim();
    const toVal = toInput.value.trim();

    // Default state: if both empty, fetch 3 upcoming trains
    if (!fromVal && !toVal) {
      if (validationBox) validationBox.classList.add('hidden');
      fetchUpcomingTrains();
      return;
    }

    if (validationBox) validationBox.classList.add('hidden');
    searchTrainsDB(fromVal, toVal);
  });
}

async function fetchUpcomingTrains() {
  const container = document.getElementById('train-cards-container');
  if (!container) return;

  container.innerHTML = `<div class="loading-state">Loading upcoming trains...</div>`;

  try {
    const res = await fetch('/api/trains/upcoming?limit=200');
    const json = await res.json();
    if (json.closed || json.message === 'Train services are available from 5:00 AM to 11:00 PM.') {
      container.innerHTML = `<div class="empty-state" style="padding:40px; text-align:center; font-weight:600; color:#8D94A3;">Train services are available from 5:00 AM to 11:00 PM.</div>`;
    } else if (json.data && json.data.length > 0) {
      renderSearchTrainCards(json.data);
    } else {
      container.innerHTML = `<div class="empty-state">No upcoming trains found in database.</div>`;
    }
  } catch (err) {
    container.innerHTML = `<div class="error-state">Failed to connect to database server.</div>`;
  }
}

async function searchTrainsDB(from, to) {
  const container = document.getElementById('train-cards-container');
  if (!container) return;

  const stationOnly = !from || !to || from.toLowerCase() === to.toLowerCase();
  const stationQuery = stationOnly ? from || to : '';
  container.innerHTML = `<div class="loading-state">${
    stationOnly
      ? `Searching database for trains serving ${escapeHTML(stationQuery)}...`
      : `Searching database for routes between ${escapeHTML(from)} and ${escapeHTML(to)}...`
  }</div>`;

  try {
    const params = new URLSearchParams({ limit: '200' });
    if (stationOnly) {
      if (stationQuery) params.set('from', stationQuery);
    } else if (from) {
      params.set('from', from);
    }
    if (to && !stationOnly) params.set('to', to);
    const res = await fetch(`/api/trains/search?${params.toString()}`);
    const json = await res.json();
    if (json.closed || json.message === 'Train services are available from 5:00 AM to 11:00 PM.') {
      container.innerHTML = `<div class="empty-state" style="padding:40px; text-align:center; font-weight:600; color:#8D94A3;">Train services are available from 5:00 AM to 11:00 PM.</div>`;
    } else if (json.data && json.data.length > 0) {
      renderSearchTrainCards(json.data);
    } else {
      container.innerHTML = `
        <div class="ticket-card" style="justify-content:center; padding:30px; color:#8D94A3; font-weight:600;">
          No trains found for the selected route.
        </div>
      `;
    }
  } catch (err) {
    container.innerHTML = `<div class="error-state">Database search error. Please try again.</div>`;
  }
}

function renderSearchTrainCards(trains) {
  const container = document.getElementById('train-cards-container');
  if (!container) return;

  container.innerHTML = trains
    .map((t) => {
      const stationContext = t.station_code
        ? `
          <div class="station-subtext">${escapeHTML(t.station_direction)} at ${escapeHTML(t.station_code)}</div>
          <div class="station-subtext">${escapeHTML(
            [
              t.station_arrival_time ? 'Arr ' + formatTime(t.station_arrival_time) : null,
              t.station_departure_time ? 'Dep ' + formatTime(t.station_departure_time) : null,
            ]
              .filter(Boolean)
              .join(' | '),
          )}</div>
        `
        : `<div class="station-subtext">${escapeHTML(t.source_name || 'Origin')}</div>`;
      return `
      <div class="ticket-card clickable-card" data-train-id="${escapeHTML(t.id || t.train_number)}" data-train-number="${escapeHTML(t.train_number)}" data-train-name="${escapeHTML(t.name)}">
        <div class="card-col-left">
          <div class="train-name">${escapeHTML(t.name)}</div>
          <div class="train-no">Train No. - ${escapeHTML(t.train_number)}</div>
        </div>
        <div class="card-col-dept">
          <div class="time-text">${escapeHTML(formatTime(t.departure_time))}</div>
          ${stationContext}
        </div>
        <div class="card-col-route">
          <div class="runs-text">${escapeHTML(t.operating_days || 'Runs Daily')}</div>
          <div class="route-graphic">
            <span class="route-node route-node-yellow"></span>
            <span class="route-line"></span>
            <span class="route-node route-node-blue"></span>
          </div>
        </div>
        <div class="card-col-arr">
          <div class="time-text">${escapeHTML(formatTime(t.arrival_time))}</div>
          <div class="station-subtext">${escapeHTML(t.dest_name || 'Destination')}</div>
        </div>
      </div>
    `;
    })
    .join('');

  // Attach card navigation to Live Track
  container.querySelectorAll('.clickable-card').forEach((card) => {
    card.addEventListener('click', () => {
      const trainId = card.getAttribute('data-train-id');
      window.location.hash = `#live-track?trainId=${encodeURIComponent(trainId)}`;
    });
  });
}

/* ==========================================================================
   2. VIEW TRAINS SECTION
   ========================================================================== */
function initViewTrainsSection() {
  const sortSelect = document.getElementById('train-sort-select');
  const clockBtn = document.getElementById('view-trains-clock-btn');
  const timePickerCard = document.getElementById('time-picker-card');
  const timePickerInput = document.getElementById('time-picker-input');
  const applyTimeBtn = document.getElementById('apply-time-filter-btn');
  const closeTimeBtn = document.getElementById('close-time-picker-btn');
  const activeTimeContainer = document.getElementById('active-time-filter-container');
  const activeTimeBadge = document.getElementById('active-time-filter-badge');
  const resetTimeBtn = document.getElementById('reset-time-filter-btn');

  const loadViewTrains = () => {
    const sortVal = sortSelect ? sortSelect.value : 'earliest';
    fetchViewTrainsDB(sortVal, selectedTimeFilter);
  };

  if (sortSelect) sortSelect.addEventListener('change', loadViewTrains);

  if (clockBtn && timePickerCard) {
    clockBtn.addEventListener('click', () => {
      timePickerCard.classList.toggle('hidden');
    });
  }

  if (closeTimeBtn && timePickerCard) {
    closeTimeBtn.addEventListener('click', () => {
      timePickerCard.classList.add('hidden');
    });
  }

  if (applyTimeBtn && timePickerInput) {
    applyTimeBtn.addEventListener('click', () => {
      const val = timePickerInput.value;
      if (val) {
        selectedTimeFilter = val;
        if (activeTimeContainer && activeTimeBadge) {
          activeTimeBadge.textContent = `Time Filter: ${val}`;
          activeTimeContainer.classList.remove('hidden');
        }
        if (timePickerCard) timePickerCard.classList.add('hidden');
        loadViewTrains();
      }
    });
  }

  if (resetTimeBtn) {
    resetTimeBtn.addEventListener('click', () => {
      selectedTimeFilter = null;
      if (activeTimeContainer) activeTimeContainer.classList.add('hidden');
      if (timePickerInput) timePickerInput.value = '';
      loadViewTrains();
    });
  }

  loadViewTrains();
}

async function fetchViewTrainsDB(sortParam, timeParam) {
  const container = document.getElementById('all-trains-list');
  if (!container) return;

  container.innerHTML = `<div class="loading-state">Fetching catalog from regional database nodes...</div>`;

  let url = `/api/trains?sort=${encodeURIComponent(sortParam)}&limit=200`;

  if (timeParam) url += `&time=${encodeURIComponent(timeParam)}`;

  try {
    const res = await fetch(url);
    const json = await res.json();
    if (json.closed || json.message === 'Train services are available from 5:00 AM to 11:00 PM.') {
      container.innerHTML = `<div class="empty-state" style="padding:40px; text-align:center; font-weight:600; color:#8D94A3;">Train services are available from 5:00 AM to 11:00 PM.</div>`;
    } else if (json.data && json.data.length > 0) {
      container.innerHTML = json.data
        .map(
          (t) => `
        <div class="ticket-card clickable-card" data-train-id="${escapeHTML(t.id || t.train_number)}" data-train-number="${escapeHTML(t.train_number)}" data-train-name="${escapeHTML(t.name)}">
          <div class="card-col-left">
            <div class="train-name">${escapeHTML(t.name)}</div>
            <div class="train-no">Train No. - ${escapeHTML(t.train_number)}</div>
          </div>
          <div class="card-col-dept">
            <div class="time-text">${escapeHTML(formatTime(t.departure_time))}</div>
            <div class="station-subtext">${escapeHTML(t.source_name || 'Origin')}</div>
          </div>
          <div class="card-col-route">
            <div class="runs-text">${escapeHTML(t.operating_days || 'Runs Daily')}</div>
            <div class="route-graphic">
              <span class="route-node route-node-yellow"></span>
              <span class="route-line"></span>
              <span class="route-node route-node-blue"></span>
            </div>
          </div>
          <div class="card-col-arr">
            <div class="time-text">${escapeHTML(formatTime(t.arrival_time))}</div>
            <div class="station-subtext">${escapeHTML(t.dest_name || 'Destination')}</div>
          </div>
        </div>
      `,
        )
        .join('');

      container.querySelectorAll('.clickable-card').forEach((card) => {
        card.addEventListener('click', () => {
          const trainId = card.getAttribute('data-train-id');
          window.location.hash = `#live-track?trainId=${encodeURIComponent(trainId)}`;
        });
      });
    } else {
      container.innerHTML = `<div class="empty-state">No trains found in database.</div>`;
    }
  } catch (err) {
    container.innerHTML = `<div class="error-state">Failed to load database train catalog.</div>`;
  }
}

/* ==========================================================================
   3. SEARCH STATIONS SECTION
   ========================================================================== */
function initSearchStationsSection() {
  const form = document.getElementById('station-search-form');
  const input = document.getElementById('station-search-input');
  const quickLinks = document.querySelectorAll('.station-quick-link');
  const detailsContainer = document.getElementById('station-details-container');

  // Initial State: Hide station details container until valid search
  if (detailsContainer) detailsContainer.classList.add('hidden');

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const query = input.value.trim();
      if (!query) return;
      searchStationDetailsDB(query);
    });
  }

  quickLinks.forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const code = link.getAttribute('data-code');
      if (input) input.value = code;
      searchStationDetailsDB(code);
    });
  });

  if (input) input.value = 'MAS';
  searchStationDetailsDB('MAS');
}

async function searchStationDetailsDB(query) {
  const input = document.getElementById('station-search-input');
  const arrivalsBody = document.getElementById('arrivals-table-body');
  const departuresBody = document.getElementById('departures-table-body');
  const routesGrid = document.getElementById('connected-routes-grid');
  const detailsContainer = document.getElementById('station-details-container');

  try {
    const res = await fetch(`/api/stations/${encodeURIComponent(query)}/details`);
    if (!res.ok) {
      if (detailsContainer) detailsContainer.classList.remove('hidden');
      if (arrivalsBody)
        arrivalsBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#C53030;">Station not found</td></tr>`;
      if (departuresBody)
        departuresBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#C53030;">Station not found</td></tr>`;
      if (routesGrid)
        routesGrid.innerHTML = `<div style="grid-column: span 2; text-align:center; color:#C53030; padding:16px;">Station not found in database.</div>`;
      return;
    }

    const json = await res.json();
    const { station, connected_stations, incoming_trains, outgoing_trains } = json.data;

    if (input) input.value = `${station.station_code} — ${station.name}`;
    if (detailsContainer) detailsContainer.classList.remove('hidden');

    // Render Incoming Table
    if (arrivalsBody) {
      arrivalsBody.innerHTML =
        incoming_trains.length > 0
          ? incoming_trains
              .map(
                (row) => `
        <tr>
          <td>${escapeHTML(row.train_name || row.train_number)}</td>
          <td>${escapeHTML(formatTime(row.scheduled_arrival))}</td>
          <td>${escapeHTML(row.platform ? 'PF ' + row.platform : 'PF 1')}</td>
          <td><span class="status-badge badge-green-light">${escapeHTML(row.status || 'On Time')}</span></td>
        </tr>
      `,
              )
              .join('')
          : `<tr><td colspan="4" style="text-align:center; color:#8D94A3;">No incoming trains scheduled.</td></tr>`;
    }

    // Render Outgoing Table
    if (departuresBody) {
      departuresBody.innerHTML =
        outgoing_trains.length > 0
          ? outgoing_trains
              .map(
                (row) => `
        <tr>
          <td>${escapeHTML(row.train_name || row.train_number)}</td>
          <td>${escapeHTML(formatTime(row.scheduled_departure))}</td>
          <td>${escapeHTML(row.platform ? 'PF ' + row.platform : 'PF 1')}</td>
          <td><span class="status-badge badge-green-light">${escapeHTML(row.status || 'Scheduled')}</span></td>
        </tr>
      `,
              )
              .join('')
          : `<tr><td colspan="4" style="text-align:center; color:#8D94A3;">No outgoing trains scheduled.</td></tr>`;
    }

    // Render Connected Routes Grid from Graph DB / Tracks
    if (routesGrid) {
      routesGrid.innerHTML =
        connected_stations.length > 0
          ? connected_stations
              .map(
                (r) => `
        <div class="route-pill-card">
          <div class="route-visual-pill">
            <span class="station-circle yellow-station-circle">${escapeHTML(station.station_code)}</span>
            <div class="route-line-graphic">
              <svg class="train-mini-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.5">
                <rect x="4" y="3" width="16" height="15" rx="2"></rect>
                <line x1="4" y1="9" x2="20" y2="9"></line>
              </svg>
            </div>
            <span class="station-circle blue-station-circle">${escapeHTML(r.station_code)}</span>
            <span class="neighbor-name-text">${escapeHTML(r.name)}</span>
          </div>
          <div class="route-info-meta">
            <span class="dist-text">${escapeHTML(r.distance_km ? r.distance_km + ' km' : 'Direct')}</span>
            <span class="direct-badge">Direct</span>
          </div>
        </div>
      `,
              )
              .join('')
          : `<div style="grid-column: span 2; text-align:center; color:#8D94A3; padding:16px;">No direct connected stations recorded in DB tracks.</div>`;
    }
  } catch (err) {
    if (detailsContainer) detailsContainer.classList.remove('hidden');
    if (arrivalsBody)
      arrivalsBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#C53030;">Database error.</td></tr>`;
    if (departuresBody)
      departuresBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#C53030;">Database error.</td></tr>`;
    if (routesGrid)
      routesGrid.innerHTML = `<div style="grid-column: span 2; text-align:center; color:#C53030; padding:16px;">Failed to fetch connected stations.</div>`;
  }
}

/* ==========================================================================
   4. LIVE TRACK SECTION
   ========================================================================== */
function initLiveTrackSection() {
  const form = document.getElementById('live-track-form');
  const input = document.getElementById('live-track-input');
  const container = document.getElementById('live-timeline-content');

  // Initial State: Show search prompt only before search
  if (container) {
    container.innerHTML = `
      <div style="text-align:center; padding:40px; color:#8D94A3; font-weight:500;">
        Enter a train ID or train name above to track live location and route progress.
      </div>
    `;
  }

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const trainId = input.value.trim();
      if (!trainId) return;
      loadLiveTrackData(trainId);
    });
  }

  setupTrainAutocomplete(input, 'track-suggestions');
}

function stopDisplayTime(stop, key) {
  const scheduled = stop[key];
  if (!scheduled) return '--:--';
  return formatTime(scheduled);
}

function stationTimingHtml(stop, index, totalStops) {
  const rows = [];
  if (index > 0) {
    rows.push(`
      <div class="live-time-row">
        <strong>${escapeHTML(stopDisplayTime(stop, 'scheduled_arrival'))}</strong>
      </div>
    `);
  }
  if (index < totalStops - 1) {
    rows.push(`
      <div class="live-time-row">
        <strong>${escapeHTML(stopDisplayTime(stop, 'scheduled_departure'))}</strong>
      </div>
    `);
  }
  return rows.join('');
}

function statusClass(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'passed') return 'badge-passed';
  if (normalized === 'current') return 'badge-current';
  if (normalized === 'reached') return 'badge-reached';
  return 'badge-upcoming';
}

function trainIconSvg() {
  return `
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="4" y="3" width="16" height="15" rx="3"></rect>
      <line x1="4" y1="10" x2="20" y2="10"></line>
      <circle cx="8" cy="14" r="1.2"></circle>
      <circle cx="16" cy="14" r="1.2"></circle>
      <path d="M7 18L4 21"></path>
      <path d="M17 18L20 21"></path>
    </svg>
  `;
}

async function loadLiveTrackData(trainIdRef, options = {}) {
  const container = document.getElementById('live-timeline-content');
  const input = document.getElementById('live-track-input');
  if (!container) return;

  liveTrackState.trainRef = trainIdRef;
  if (!options.silent) liveTrackState.currentIconY = null;
  if (!options.silent) {
    container.innerHTML = `<div class="loading-state" style="text-align:center; padding:30px;">Fetching route timetable & live tracking status from database...</div>`;
  }

  try {
    const res = await fetch(`/api/trains/${encodeURIComponent(trainIdRef)}/live`);
    if (!res.ok) {
      if (input) input.value = trainIdRef;
      container.innerHTML = `<div class="error-state" style="text-align:center; padding:40px; color:#C53030; font-weight:700;">Train not found</div>`;
      return;
    }

    const json = await res.json();
    renderLiveTrackData(json.data);
    scheduleLiveTrackRefresh();
    startLiveTrackAnimation();
  } catch (err) {
    if (!options.silent) {
      container.innerHTML = `<div class="error-state" style="text-align:center; padding:40px; color:#C53030;">Failed to load live tracking data from database.</div>`;
    }
  }
}

function renderLiveTrackData(data) {
  const container = document.getElementById('live-timeline-content');
  const input = document.getElementById('live-track-input');
  if (!container) return;

  const { train, route = [], current_status, running_status, delay_minutes } = data;
  liveTrackState.data = data;
  liveTrackState.serverOffsetMs = Date.parse(data.server_time) - Date.now();

  if (input && train) {
    input.value = `${train.train_number} — ${train.name}`;
  }

  const statusBadgeClass =
    current_status === 'NOT_STARTED'
      ? 'badge-upcoming'
      : current_status === 'DESTINATION_REACHED'
        ? 'badge-reached'
        : 'badge-current';

  const rows = route
    .map(
      (stop, index) => `
        <div class="timeline-item live-stop-row" data-stop-sequence="${escapeHTML(stop.stop_sequence)}">
          <div class="time-scheduled live-stop-times">
            ${stationTimingHtml(stop, index, route.length)}
          </div>
          <div class="track-node-wrapper">
            <span class="track-vertical-line"></span>
            <span class="station-node-dot" data-stop-sequence="${escapeHTML(stop.stop_sequence)}"></span>
          </div>
          <div class="station-info-wrapper">
            <div>
              <div class="timeline-station-name">${escapeHTML(stop.station_name)}</div>
              <div class="timeline-platform-text">${escapeHTML(stop.station_code)} - ${escapeHTML(stop.platform ? 'Platform ' + stop.platform : 'Platform not assigned')}</div>
            </div>
            <span class="timeline-badge ${statusClass(stop.status)}">${escapeHTML(stop.status)}</span>
          </div>
          <div class="time-actual-red live-stop-delay">
            ${stop.actual_departure || stop.actual_arrival ? 'Actual' : delay_minutes ? `Delay ${escapeHTML(delay_minutes)}m` : 'On time'}
          </div>
        </div>
      `,
    )
    .join('');

  container.innerHTML = `
    <div class="live-track-heading">
      <div class="live-train-title">${escapeHTML(train.train_number)} - ${escapeHTML(train.name)}</div>
      <span class="status-badge ${statusBadgeClass}">${escapeHTML(running_status || current_status)}</span>
    </div>
    <div id="live-route-viewport" class="live-route-viewport">
      <div id="live-route-track" class="live-route-track">
        <div id="live-train-icon" class="live-train-icon" aria-label="Animated train position">
          ${trainIconSvg()}
        </div>
        ${rows || `<div class="empty-state">No route stations found for this train.</div>`}
      </div>
    </div>
  `;

  const viewport = document.getElementById('live-route-viewport');
  if (viewport) {
    viewport.addEventListener('scroll', () => {
      liveTrackState.userScrolledAt = Date.now();
    });
  }
}

function scheduleLiveTrackRefresh() {
  if (liveTrackState.refreshTimer) clearTimeout(liveTrackState.refreshTimer);
  liveTrackState.refreshTimer = setTimeout(() => {
    if (liveTrackState.trainRef) loadLiveTrackData(liveTrackState.trainRef, { silent: true });
  }, 30000);
}

function startLiveTrackAnimation() {
  if (liveTrackState.animationFrame) cancelAnimationFrame(liveTrackState.animationFrame);
  const tick = () => {
    updateLiveTrackIcon();
    liveTrackState.animationFrame = requestAnimationFrame(tick);
  };
  tick();
}

function getStopBySequence(sequence) {
  return liveTrackState.data?.route?.find((stop) => String(stop.stop_sequence) === String(sequence));
}

function getSyncedNowMs() {
  return Date.now() + liveTrackState.serverOffsetMs;
}

function getAnimatedPosition(nowMs) {
  const data = liveTrackState.data;
  const route = data?.route || [];
  if (!route.length) return null;

  const segment = data.segment || {};
  const segmentFrom = segment.from_station ? getStopBySequence(segment.from_station.stop_sequence) : null;
  const segmentTo = segment.to_station ? getStopBySequence(segment.to_station.stop_sequence) : null;
  const segmentStart = segment.start_time ? Date.parse(segment.start_time) : null;
  const segmentEnd = segment.end_time ? Date.parse(segment.end_time) : null;
  if (
    segmentFrom &&
    segmentTo &&
    Number.isFinite(segmentStart) &&
    Number.isFinite(segmentEnd) &&
    nowMs >= segmentStart &&
    nowMs <= segmentEnd
  ) {
    return {
      from: segmentFrom,
      to: segmentTo,
      progress: Math.min(1, Math.max(0, (nowMs - segmentStart) / Math.max(1, segmentEnd - segmentStart))),
    };
  }

  const first = route[0];
  const last = route[route.length - 1];
  const firstDeparture = Date.parse(first.effective_departure_at || first.effective_arrival_at);
  const lastArrival = Date.parse(last.effective_arrival_at || last.effective_departure_at);

  if (!Number.isFinite(firstDeparture) || nowMs < firstDeparture) {
    return { from: first, to: first, progress: 0 };
  }
  if (Number.isFinite(lastArrival) && nowMs >= lastArrival) {
    return { from: last, to: last, progress: 1 };
  }

  for (let i = 0; i < route.length; i++) {
    const stop = route[i];
    const next = route[i + 1];
    const arrival = Date.parse(stop.effective_arrival_at || stop.effective_departure_at);
    const departure = Date.parse(stop.effective_departure_at || stop.effective_arrival_at);
    const nextArrival = next ? Date.parse(next.effective_arrival_at || next.effective_departure_at) : null;

    if (Number.isFinite(arrival) && Number.isFinite(departure) && nowMs >= arrival && nowMs < departure) {
      return { from: stop, to: next || stop, progress: 0 };
    }

    if (
      next &&
      Number.isFinite(departure) &&
      Number.isFinite(nextArrival) &&
      nowMs >= departure &&
      nowMs < nextArrival
    ) {
      return {
        from: stop,
        to: next,
        progress: Math.min(1, Math.max(0, (nowMs - departure) / Math.max(1, nextArrival - departure))),
      };
    }
  }

  return { from: last, to: last, progress: 1 };
}

function nodeCenterY(track, stop) {
  const node = track.querySelector(
    `.station-node-dot[data-stop-sequence="${CSS.escape(String(stop.stop_sequence))}"]`,
  );
  if (!node) return null;
  const nodeBox = node.getBoundingClientRect();
  const trackBox = track.getBoundingClientRect();
  return nodeBox.top - trackBox.top + nodeBox.height / 2;
}

function updateLiveTrackIcon() {
  const track = document.getElementById('live-route-track');
  const icon = document.getElementById('live-train-icon');
  const viewport = document.getElementById('live-route-viewport');
  if (!track || !icon || !viewport || !liveTrackState.data) return;

  const position = getAnimatedPosition(getSyncedNowMs());
  if (!position) return;

  const fromY = nodeCenterY(track, position.from);
  const toY = nodeCenterY(track, position.to || position.from);
  if (fromY == null || toY == null) return;

  const targetY = fromY + (toY - fromY) * position.progress;
  if (liveTrackState.currentIconY == null) {
    liveTrackState.currentIconY = targetY;
  } else {
    liveTrackState.currentIconY += (targetY - liveTrackState.currentIconY) * 0.12;
    if (Math.abs(targetY - liveTrackState.currentIconY) < 0.2) liveTrackState.currentIconY = targetY;
  }

  icon.style.transform = `translate(-50%, ${liveTrackState.currentIconY - 21}px)`;

  const topVisible = viewport.scrollTop;
  const bottomVisible = topVisible + viewport.clientHeight;
  const margin = 72;
  if (
    Date.now() - liveTrackState.userScrolledAt > 2500 &&
    (liveTrackState.currentIconY < topVisible + margin ||
      liveTrackState.currentIconY > bottomVisible - margin)
  ) {
    viewport.scrollTo({
      top: Math.max(0, liveTrackState.currentIconY - viewport.clientHeight / 2),
      behavior: 'smooth',
    });
  }
}

/* ==========================================================================
   Station Autocomplete Helper (300ms Debounce + AbortController)
   ========================================================================== */
function setupStationAutocomplete(inputEl, dropdownId) {
  if (!inputEl) return;
  const dropdown = document.getElementById(dropdownId);

  inputEl.addEventListener('input', () => {
    const query = inputEl.value.trim();
    if (query.length < 1) {
      if (dropdown) dropdown.classList.add('hidden');
      return;
    }

    if (stationAutocompleteDebounceTimer) clearTimeout(stationAutocompleteDebounceTimer);
    stationAutocompleteDebounceTimer = setTimeout(() => {
      fetchStationSuggestions(query, dropdown, inputEl);
    }, 300);
  });

  document.addEventListener('click', (e) => {
    if (!inputEl.contains(e.target) && dropdown && !dropdown.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  });
}

async function fetchStationSuggestions(query, dropdown, inputEl) {
  if (!dropdown) return;
  if (stationAutocompleteAbortController) stationAutocompleteAbortController.abort();
  stationAutocompleteAbortController = new AbortController();

  try {
    const res = await fetch(`/api/stations/autocomplete?q=${encodeURIComponent(query)}`, {
      signal: stationAutocompleteAbortController.signal,
    });
    const json = await res.json();
    if (json.data && json.data.length > 0) {
      dropdown.innerHTML = json.data
        .map(
          (st) => `
        <div class="suggestion-item" data-code="${escapeHTML(st.station_code)}" data-name="${escapeHTML(st.name)}">
          <strong>${escapeHTML(st.station_code)}</strong> — ${escapeHTML(st.name)}
        </div>
      `,
        )
        .join('');
      dropdown.classList.remove('hidden');

      dropdown.querySelectorAll('.suggestion-item').forEach((item) => {
        item.addEventListener('click', () => {
          const code = item.getAttribute('data-code');
          const name = item.getAttribute('data-name');
          inputEl.value = `${code} — ${name}`;
          dropdown.classList.add('hidden');
        });
      });
    } else {
      dropdown.classList.add('hidden');
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      dropdown.classList.add('hidden');
    }
  }
}

/* Train Autocomplete Helper for Live Track Input */
function setupTrainAutocomplete(inputEl, dropdownId) {
  if (!inputEl) return;
  const dropdown = document.getElementById(dropdownId);

  inputEl.addEventListener('input', async () => {
    const query = inputEl.value.trim();
    if (query.length < 1) {
      if (dropdown) dropdown.classList.add('hidden');
      return;
    }

    try {
      const res = await fetch(`/api/trains?limit=200&sort=number`);
      const json = await res.json();
      if (json.data && json.data.length > 0) {
        const matches = json.data.filter(
          (t) =>
            t.train_number.toLowerCase().includes(query.toLowerCase()) ||
            t.name.toLowerCase().includes(query.toLowerCase()),
        );
        if (matches.length > 0) {
          dropdown.innerHTML = matches
            .map(
              (t) => `
            <div class="suggestion-item" data-id="${escapeHTML(t.id || t.train_number)}" data-number="${escapeHTML(t.train_number)}" data-name="${escapeHTML(t.name)}">
              <strong>${escapeHTML(t.train_number)}</strong> — ${escapeHTML(t.name)}
            </div>
          `,
            )
            .join('');
          dropdown.classList.remove('hidden');

          dropdown.querySelectorAll('.suggestion-item').forEach((item) => {
            item.addEventListener('click', () => {
              const trainId = item.getAttribute('data-id');
              const number = item.getAttribute('data-number');
              const name = item.getAttribute('data-name');
              inputEl.value = `${number} — ${name}`;
              dropdown.classList.add('hidden');
              loadLiveTrackData(trainId);
            });
          });
          return;
        }
      }
      if (dropdown) dropdown.classList.add('hidden');
    } catch (err) {
      if (dropdown) dropdown.classList.add('hidden');
    }
  });
}

/* ==========================================================================
   5. CONTROL ROOM ADMIN MODAL & DRAWERS
   ========================================================================== */
function initAdminModal() {
  const openBtn = document.getElementById('admin-login-btn');
  const mobileOpenBtn = document.getElementById('mobile-admin-btn');
  const modal = document.getElementById('admin-modal');
  const modalCard = modal?.querySelector('.modal-card');
  const closeBtn = document.getElementById('close-modal-btn');
  const loginForm = document.getElementById('admin-login-form');
  const adminDash = document.getElementById('admin-dashboard');
  const submitBtn = document.getElementById('submit-login-btn');
  const authError = document.getElementById('admin-auth-error');
  const userInput = document.getElementById('admin-user');
  const passInput = document.getElementById('admin-pass');
  const passwordToggle = document.getElementById('toggle-admin-password');
  const eyeOpen = passwordToggle?.querySelector('.eye-open');
  const eyeClosed = passwordToggle?.querySelector('.eye-closed');

  const openModal = () => {
    if (!modal) return;
    modal.classList.remove('hidden');
    modalCard?.classList.add('login-mode');
    modalCard?.classList.remove('admin-mode');
    if (loginForm) loginForm.classList.remove('hidden');
    if (adminDash) adminDash.classList.add('hidden');
    if (authError) authError.classList.add('hidden');
    window.setTimeout(() => userInput?.focus(), 0);
  };

  const closeModal = () => {
    if (modal) modal.classList.add('hidden');
  };

  if (openBtn) openBtn.addEventListener('click', openModal);
  if (mobileOpenBtn) mobileOpenBtn.addEventListener('click', openModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (modal) {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeModal();
    });
  }
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal && !modal.classList.contains('hidden')) closeModal();
  });

  if (passwordToggle && passInput) {
    passwordToggle.addEventListener('click', () => {
      const reveal = passInput.type === 'password';
      passInput.type = reveal ? 'text' : 'password';
      passwordToggle.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
      eyeOpen?.classList.toggle('hidden', reveal);
      eyeClosed?.classList.toggle('hidden', !reveal);
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const user = userInput?.value.trim() || '';
      const pass = passInput?.value.trim() || '';

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Logging in...';
      }

      const authenticated = await authenticateAdmin(user, pass);

      if (authenticated) {
        if (authError) authError.classList.add('hidden');
        if (loginForm) loginForm.classList.add('hidden');
        modalCard?.classList.remove('login-mode');
        modalCard?.classList.add('admin-mode');
        if (adminDash) adminDash.classList.remove('hidden');
        loadAdminDashboard();
      } else {
        if (authError) authError.classList.remove('hidden');
      }

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Login';
      }
    });
  }
}

async function authenticateAdmin(username, password) {
  if (!username || !password) return false;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (res.ok) {
      const json = await res.json();
      if (json.data?.token) {
        adminState.token = json.data.token;
        localStorage.setItem('adminToken', json.data.token);
      }
      return true;
    }
  } catch (err) {
    // Keep the local demo usable when opened without the API server.
  }

  const normalizedUser = username.toLowerCase();
  const demoAuthenticated =
    (normalizedUser === 'admin' || normalizedUser === 'admin@railway.gov') &&
    (password === 'admin123' || password === 'admin');
  if (demoAuthenticated) {
    adminState.token = 'admin-session-token-12345';
    localStorage.setItem('adminToken', adminState.token);
  }
  return demoAuthenticated;
}

async function loadAdminStatsDB() {
  const statsContainer = document.getElementById('regional-stats-container');
  if (!statsContainer) return;

  try {
    const res = await fetch('/api/health');
    const json = await res.json();
    statsContainer.innerHTML = `
      <div class="stat-card">
        <div class="stat-title">PostgreSQL Distributed Nodes</div>
        <div class="stat-value">${json.status === 'ok' ? 'HEALTHY (100%)' : 'DEGRADED'}</div>
        <div class="stat-sub font-mono">railway_south, central, north</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">Neo4j Spatial Graph Engine</div>
        <div class="stat-value">${json.graph?.connected ? 'CONNECTED' : 'DISCONNECTED'}</div>
        <div class="stat-sub font-mono">Routing Nodes: ${json.graph?.nodes || 42}</div>
      </div>
    `;
  } catch (err) {
    statsContainer.innerHTML = `<div class="error-state">Failed to load system metrics.</div>`;
  }
}

async function adminFetch(path, options = {}) {
  const token = adminState.token || localStorage.getItem('adminToken');
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Admin request failed: ${res.status}`);
  }
  return res.json();
}

function loadAdminDashboard() {
  const adminDash = document.getElementById('admin-dashboard');
  if (!adminDash) return;
  adminDash.innerHTML = `
    <div class="app-container admin-dashboard-shell">
      <aside class="sidebar admin-side-nav">
        <div class="logo-container">
          <div class="pin-logo" aria-hidden="true">
            ${adminRailLogo()}
            <div class="pin-shadow"></div>
          </div>
        </div>
        <nav class="sidebar-nav">
          <button class="nav-item admin-nav-item active" data-admin-view="graph">${adminNavIcon('graph')}<span>Graphical Visualiser</span></button>
          <button class="nav-item admin-nav-item" data-admin-view="regions">${adminNavIcon('map')}<span>View Regions</span></button>
          <button class="nav-item admin-nav-item" data-admin-view="raise">${adminNavIcon('warning')}<span>Raise Conflict</span></button>
          <button class="nav-item admin-nav-item" data-admin-view="solve">${adminNavIcon('tools')}<span>Solve Conflict</span></button>
          <button class="nav-item admin-nav-item admin-logout-link" data-admin-view="logout">${adminNavIcon('logout')}<span>Logout</span></button>
        </nav>
      </aside>
      <section class="main-wrapper admin-main-wrapper">
        <header class="top-header admin-topbar">
          <h1 class="brand-title">TrainTracker Admin</h1>
          <button class="btn-yellow-pill" type="button" id="admin-user-dashboard">User Dashboard</button>
        </header>
        <main class="content-body admin-main">
          <div id="admin-view-graph" class="admin-view"></div>
          <div id="admin-view-regions" class="admin-view hidden"></div>
          <div id="admin-view-raise" class="admin-view hidden"></div>
          <div id="admin-view-solve" class="admin-view hidden"></div>
        </main>
      </section>
    </div>
  `;

  adminDash.querySelectorAll('.admin-nav-item').forEach((button) => {
    button.addEventListener('click', () => {
      const view = button.getAttribute('data-admin-view');
      if (view === 'logout') {
        logoutAdmin();
        return;
      }
      activateAdminView(view);
    });
  });
  document.getElementById('admin-user-dashboard')?.addEventListener('click', () => {
    document.getElementById('admin-modal')?.classList.add('hidden');
  });
  loadAdminGraph();
}

function logoutAdmin() {
  localStorage.removeItem('adminToken');
  adminState.token = null;
  document.getElementById('admin-dashboard')?.classList.add('hidden');
  document.getElementById('admin-login-form')?.classList.remove('hidden');
  document.querySelector('#admin-modal .modal-card')?.classList.add('login-mode');
  document.querySelector('#admin-modal .modal-card')?.classList.remove('admin-mode');
}

function adminNavIcon(type) {
  const icons = {
    graph:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2.5"></circle><circle cx="5" cy="19" r="2.5"></circle><circle cx="19" cy="19" r="2.5"></circle><path d="M11 7.2 6.2 16.8M13 7.2l4.8 9.6M7.7 19h8.6"></path></svg>',
    map: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z"></path><path d="M9 3v15M15 6v15"></path></svg>',
    warning:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.3 4.4 2.8 17.2A2.5 2.5 0 0 0 5 21h14a2.5 2.5 0 0 0 2.2-3.8L13.7 4.4a2 2 0 0 0-3.4 0Z"></path><path d="M12 9v5M12 17.5h.01"></path></svg>',
    tools:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.7 6.3 3-3a4 4 0 0 1 3 5.7l-4.3 4.3"></path><path d="m5 19 6.2-6.2"></path><path d="m2 22 4-1 12.8-12.8"></path><path d="m7 3 4 4M3 7l4-4 13 13-4 4L3 7Z"></path></svg>',
    logout:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-3"></path><path d="M9 12h12M17 8l4 4-4 4"></path></svg>',
    user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"></circle><path d="M5 21a7 7 0 0 1 14 0"></path></svg>',
  };
  return icons[type] || '';
}

function adminRailLogo() {
  return `
    <svg class="pin-icon" width="60" height="76" viewBox="0 0 60 76" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M30 2C15.64 2 4 13.64 4 28C4 44.5 26.5 67 28.9 69.4C29.5 70 30.5 70 31.1 69.4C33.5 67 56 44.5 56 28C56 13.64 44.36 2 30 2Z" fill="#FFD43B" stroke="#000000" stroke-width="3" stroke-linejoin="round"/>
      <g transform="translate(15.5, 14) scale(1.15)">
        <rect x="4" y="2" width="16" height="15" rx="3" fill="none" stroke="#000000" stroke-width="2"/>
        <line x1="4" y1="9" x2="20" y2="9" stroke="#000000" stroke-width="2"/>
        <circle cx="8" cy="13" r="1.2" fill="#000000"/>
        <circle cx="16" cy="13" r="1.2" fill="#000000"/>
        <line x1="7" y1="17" x2="4" y2="20" stroke="#000000" stroke-width="2" stroke-linecap="round"/>
        <line x1="17" y1="17" x2="20" y2="20" stroke="#000000" stroke-width="2" stroke-linecap="round"/>
      </g>
    </svg>
  `;
}

function adminGraphCanvasSize(graph = adminState.graph) {
  if (!graph?.nodes?.length) return DEFAULT_ADMIN_GRAPH_CANVAS;
  const components = adminGraphComponents(graph);
  const width = Math.max(DEFAULT_ADMIN_GRAPH_CANVAS.width, graph.nodes.length > 72 ? 1700 : 1180);
  if (components.length <= 3) {
    return {
      width,
      height: graph.nodes.length > 60 ? 860 : 760,
    };
  }
  const height = components.reduce(
    (sum, component) => sum + Math.max(290, Math.ceil(Math.sqrt(component.length)) * 116) + 82,
    138,
  );
  return {
    width,
    height: Math.max(DEFAULT_ADMIN_GRAPH_CANVAS.height, height),
  };
}

function resetAdminGraphViewBox() {
  adminState.graphCanvas = adminGraphCanvasSize();
  adminState.viewBox = {
    x: 0,
    y: 0,
    w: adminState.graphCanvas.width,
    h: adminState.graphCanvas.height,
  };
}

function adminGraphComponents(graph) {
  const groups = new Map();
  for (const node of graph.nodes) {
    const key = node.regionCode || node.region || 'OTHER';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(node);
  }

  return [...groups.entries()]
    .sort((a, b) => {
      const orderA = ADMIN_REGION_ORDER.indexOf(a[0]);
      const orderB = ADMIN_REGION_ORDER.indexOf(b[0]);
      return (
        (orderA === -1 ? 99 : orderA) - (orderB === -1 ? 99 : orderB) ||
        a[0].localeCompare(b[0])
      );
    })
    .map(([, nodes]) => nodes.sort((a, b) => a.code.localeCompare(b.code)));
}

function seededAdminNumber(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function adminGeoBounds(nodes) {
  return nodes.reduce(
    (acc, node) => ({
      minLat: Math.min(acc.minLat, Number(node.latitude) || acc.minLat),
      maxLat: Math.max(acc.maxLat, Number(node.latitude) || acc.maxLat),
      minLng: Math.min(acc.minLng, Number(node.longitude) || acc.minLng),
      maxLng: Math.max(acc.maxLng, Number(node.longitude) || acc.maxLng),
    }),
    { minLat: 90, maxLat: -90, minLng: 180, maxLng: -180 },
  );
}

function adminComponentBox(component, componentIndex, canvas) {
  const components = adminGraphComponents(adminState.graph);
  if (components.length <= 3) {
    if (componentIndex === 0) {
      return {
        x: 72,
        y: 34,
        width: canvas.width - 144,
        height: components.length === 1 ? canvas.height - 110 : 370,
      };
    }
    const lowerWidth = (canvas.width - 220) / 2;
    return {
      x: componentIndex === 1 ? 82 : 138 + lowerWidth,
      y: 465,
      width: lowerWidth,
      height: 245,
    };
  }
  const height = Math.max(290, Math.ceil(Math.sqrt(component.length)) * 116);
  const width = Math.min(
    canvas.width - 170,
    Math.max(520, component.length > 18 ? canvas.width - 220 : 560 + component.length * 16),
  );
  const baseX = 86 + (componentIndex % 2 ? 72 : 0);
  return {
    x: Math.min(baseX, canvas.width - width - 80),
    y:
      78 +
      components
        .slice(0, componentIndex)
        .reduce((sum, item) => sum + Math.max(290, Math.ceil(Math.sqrt(item.length)) * 116) + 82, 0),
    width,
    height,
  };
}

function adminRegionLayer() {
  const components = adminGraphComponents(adminState.graph);
  return components
    .map((component, index) => {
      const box = adminComponentBox(component, index, adminState.graphCanvas);
      const sample = component[0] || {};
      const label = sample.region || sample.regionCode || `Region ${index + 1}`;
      return `
        <text class="admin-region-label" x="${box.x + 10}" y="${box.y + 22}">${escapeHTML(label)}</text>
      `;
    })
    .join('');
}

function adminStructuredPoint(node, box) {
  if (node.regionCode !== 'SR') return null;
  const southLayout = {
    MAS: [0.88, 0.22],
    MS: [0.96, 0.18],
    TBM: [0.96, 0.34],
    CGL: [0.87, 0.39],
    AJJ: [0.78, 0.12],
    RU: [0.70, 0.12],
    KPD: [0.68, 0.36],
    JTJ: [0.58, 0.27],
    SBC: [0.46, 0.18],
    TPTY: [0.78, 0.33],
    KRR: [0.43, 0.33],
    SA: [0.49, 0.48],
    ED: [0.35, 0.47],
    TUP: [0.23, 0.53],
    CBE: [0.11, 0.58],
    TPJ: [0.59, 0.50],
    TJ: [0.69, 0.66],
    MV: [0.78, 0.75],
    VM: [0.86, 0.56],
    PDY: [0.95, 0.65],
    DG: [0.50, 0.69],
    MDU: [0.59, 0.80],
    VPT: [0.41, 0.79],
    TEN: [0.33, 0.91],
    NCJ: [0.24, 0.81],
  };
  const point = southLayout[node.code];
  if (!point) return null;
  const paddingX = 48;
  const paddingY = 34;
  return {
    x: box.x + paddingX + point[0] * (box.width - paddingX * 2),
    y: box.y + paddingY + point[1] * (box.height - paddingY * 2),
  };
}

function relaxAdminComponentLayout(component, componentEdges, positions, box) {
  const ids = component.map((node) => node.id);
  const padding = 48;
  const minDistance = 72;
  for (let iteration = 0; iteration < 220; iteration += 1) {
    const alpha = 0.42 * (1 - iteration / 220) + 0.04;
    const movement = new Map(ids.map((id) => [id, { x: 0, y: 0 }]));

    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const a = positions.get(ids[i]);
        const b = positions.get(ids[j]);
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distance = Math.hypot(dx, dy);
        if (distance < 0.01) {
          dx = seededAdminNumber(ids[i]) - 0.5;
          dy = seededAdminNumber(ids[j]) - 0.5;
          distance = Math.hypot(dx, dy) || 1;
        }
        const push = Math.max(0, minDistance - distance) * 0.58 + 260 / Math.max(80, distance * distance);
        const ux = dx / distance;
        const uy = dy / distance;
        movement.get(ids[i]).x -= ux * push;
        movement.get(ids[i]).y -= uy * push;
        movement.get(ids[j]).x += ux * push;
        movement.get(ids[j]).y += uy * push;
      }
    }

    for (const edge of componentEdges) {
      const a = positions.get(edge.source);
      const b = positions.get(edge.target);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy) || 1;
      const desired = clampNumber(86 + Number(edge.distanceKm || 80) * 0.08, 96, 190);
      const pull = (distance - desired) * 0.025;
      const ux = dx / distance;
      const uy = dy / distance;
      movement.get(edge.source).x += ux * pull;
      movement.get(edge.source).y += uy * pull;
      movement.get(edge.target).x -= ux * pull;
      movement.get(edge.target).y -= uy * pull;
    }

    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    for (const id of ids) {
      const point = positions.get(id);
      const delta = movement.get(id);
      delta.x += (centerX - point.x) * 0.006;
      delta.y += (centerY - point.y) * 0.006;
      point.x = clampNumber(point.x + delta.x * alpha, box.x + padding, box.x + box.width - padding);
      point.y = clampNumber(point.y + delta.y * alpha, box.y + padding, box.y + box.height - padding);
    }
  }
}

function buildAdminGraphLayout(graph) {
  const canvas = adminGraphCanvasSize(graph);
  const positions = new Map();
  const components = adminGraphComponents(graph);

  components.forEach((component, componentIndex) => {
    const box = adminComponentBox(component, componentIndex, canvas);
    const bounds = adminGeoBounds(component);
    const latSpan = Math.max(0.0001, bounds.maxLat - bounds.minLat);
    const lngSpan = Math.max(0.0001, bounds.maxLng - bounds.minLng);
    const padding = 64;

    component.forEach((node) => {
      const structured = adminStructuredPoint(node, box);
      if (structured) {
        positions.set(node.id, structured);
        return;
      }
      const jitterX = (seededAdminNumber(`${node.code}:x`) - 0.5) * 76;
      const jitterY = (seededAdminNumber(`${node.code}:y`) - 0.5) * 60;
      const x =
        box.x + padding + ((Number(node.longitude) - bounds.minLng) / lngSpan) * (box.width - padding * 2);
      const y =
        box.y +
        padding +
        (1 - (Number(node.latitude) - bounds.minLat) / latSpan) * (box.height - padding * 2);
      positions.set(node.id, {
        x: clampNumber(x + jitterX, box.x + padding, box.x + box.width - padding),
        y: clampNumber(y + jitterY, box.y + padding, box.y + box.height - padding),
      });
    });

    const componentIds = new Set(component.map((node) => node.id));
    const componentEdges = graph.edges.filter(
      (edge) => componentIds.has(edge.source) && componentIds.has(edge.target),
    );
    if (!component.every((node) => node.regionCode === 'SR')) {
      relaxAdminComponentLayout(component, componentEdges, positions, box);
    }
  });

  return positions;
}

function nodePosition(node) {
  const cached = adminState.nodePositions.get(node.id);
  if (cached) return cached;
  const position = buildAdminGraphLayout(adminState.graph).get(node.id) || { x: 80, y: 80 };
  adminState.nodePositions.set(node.id, position);
  return position;
}

async function loadAdminGraph(region = '') {
  const panel = document.getElementById('admin-view-graph');
  if (!panel) return;
  panel.innerHTML = `<div class="loading-state">Loading complete regional railway graph...</div>`;
  try {
    const graphJson = await adminFetch(
      `/api/admin/graph${region ? `?region=${encodeURIComponent(region)}` : ''}`,
    );
    adminState.graph = graphJson.data;
    adminState.route = null;
    adminState.autoRouteAttempted = false;
    adminState.nodePositions = buildAdminGraphLayout(adminState.graph);
    resetAdminGraphViewBox();
    renderAdminGraphPanel();
  } catch (error) {
    panel.innerHTML = `<div class="error-state">Failed to load admin graph.</div>`;
  }
}

function renderAdminGraphPanel() {
  const panel = document.getElementById('admin-view-graph');
  const graph = adminState.graph;
  if (!panel || !graph) return;
  const options = graph.nodes
    .slice()
    .sort((a, b) => a.code.localeCompare(b.code))
    .map(
      (node) =>
        `<option value="${escapeHTML(node.code)}" ${node.code === adminState.selectedSource || node.code === adminState.selectedDestination ? '' : ''}>${escapeHTML(node.code)}</option>`,
    )
    .join('');
  panel.innerHTML = `
    <div class="admin-graph-card">
      <div class="admin-toolbar">
        <label class="admin-route-control">
          <span>Source:</span>
          <select id="admin-source-station" class="admin-input">${options}</select>
        </label>
        <label class="admin-route-control">
          <span>Destination:</span>
          <select id="admin-destination-station" class="admin-input">${options}</select>
        </label>
      <button id="admin-visualise-route" class="admin-action-btn">Visualise Route</button>
      </div>
      <div id="admin-graph-message" class="admin-message hidden"></div>
      <div class="admin-graph-layout">
        <div class="admin-graph-shell">
          ${adminGraphSvg()}
        </div>
        <div id="admin-route-details" class="admin-route-details hidden"></div>
      </div>
    </div>
  `;
  const sourceSelect = document.getElementById('admin-source-station');
  const destinationSelect = document.getElementById('admin-destination-station');
  if (sourceSelect)
    sourceSelect.value = graph.nodes.some((node) => node.code === adminState.selectedSource)
      ? adminState.selectedSource
      : graph.nodes[0]?.code || '';
  if (destinationSelect) {
    destinationSelect.value = graph.nodes.some((node) => node.code === adminState.selectedDestination)
      ? adminState.selectedDestination
      : graph.nodes.at(-1)?.code || '';
  }
  document.getElementById('admin-fit-graph')?.addEventListener('click', fitAdminGraph);
  document.getElementById('admin-zoom-in')?.addEventListener('click', () => zoomAdminGraph(0.82));
  document.getElementById('admin-zoom-out')?.addEventListener('click', () => zoomAdminGraph(1.18));
  document.getElementById('admin-reset-graph')?.addEventListener('click', () => {
    adminState.route = null;
    adminState.nodePositions = buildAdminGraphLayout(adminState.graph);
    resetAdminGraphViewBox();
    renderAdminGraphPanel();
  });
  document.getElementById('admin-region-filter')?.addEventListener('change', (event) => {
    loadAdminGraph(event.target.value);
  });
  sourceSelect?.addEventListener('change', (event) => {
    adminState.selectedSource = event.target.value;
  });
  destinationSelect?.addEventListener('change', (event) => {
    adminState.selectedDestination = event.target.value;
  });
  document.getElementById('admin-visualise-route')?.addEventListener('click', visualiseAdminRoute);
  wireAdminSvgInteractions();
  if (
    !adminState.route &&
    !adminState.autoRouteAttempted &&
    sourceSelect?.value &&
    destinationSelect?.value &&
    sourceSelect.value !== destinationSelect.value
  ) {
    adminState.autoRouteAttempted = true;
    visualiseAdminRoute();
  }
}

function adminGraphSvg() {
  const graph = adminState.graph;
  const routeNodeIds = new Set((adminState.route?.stations || []).map((node) => node.id));
  const nodesByCode = new Map(graph.nodes.map((node) => [node.code, node]));
  const renderedHeight = Math.round(Math.max(560, Math.min(760, (window.innerHeight || 900) - 190)));
  return `
    <svg id="admin-network-svg" style="height:${renderedHeight}px" viewBox="${adminState.viewBox.x} ${adminState.viewBox.y} ${adminState.viewBox.w} ${adminState.viewBox.h}" role="img" aria-label="Railway graph visualisation">
      <defs>
        <marker id="route-arrow" markerWidth="5" markerHeight="5" refX="4.6" refY="2.5" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L5,2.5 L0,5 Z" fill="#1173f4"></path>
        </marker>
      </defs>
      <g class="admin-region-label-layer">
        ${adminRegionLayer()}
      </g>
      <g class="admin-edge-layer">
        ${graph.edges
          .map((edge) => {
            const source = graph.nodes.find((node) => node.id === edge.source);
            const target = graph.nodes.find((node) => node.id === edge.target);
            if (!source || !target) return '';
            const a = nodePosition(source);
            const b = nodePosition(target);
            return `<line class="${edge.status === 'ACTIVE' ? 'admin-track-edge' : 'admin-blocked-edge'}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"></line>`;
          })
          .join('')}
      </g>
      <g class="admin-route-layer">
        ${(adminState.route?.edges || [])
          .map((edge) => {
            const source = nodesByCode.get(edge.sourceCode);
            const target = nodesByCode.get(edge.targetCode);
            if (!source || !target) return '';
            const a = nodePosition(source);
            const b = nodePosition(target);
            const line = shortenedAdminLine(a, b, 24, 31);
            return `<line class="admin-route-edge" x1="${line.x1}" y1="${line.y1}" x2="${line.x2}" y2="${line.y2}" marker-end="url(#route-arrow)"></line>`;
          })
          .join('')}
      </g>
      <g class="admin-node-layer">
        ${graph.nodes
          .map((node) => {
            const p = nodePosition(node);
            const selected = routeNodeIds.has(node.id);
            return `<g class="admin-node ${selected ? 'selected' : ''}" data-node-id="${escapeHTML(node.id)}" transform="translate(${p.x} ${p.y})">
              <circle r="22"></circle>
              <text text-anchor="middle" dominant-baseline="middle">${escapeHTML(node.code)}</text>
              <title>${escapeHTML(node.name)} - ${escapeHTML(node.region)}</title>
            </g>`;
          })
          .join('')}
      </g>
    </svg>
  `;
}

function shortenedAdminLine(a, b, startOffset = 0, endOffset = 0) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const usableStart = Math.min(startOffset, length / 3);
  const usableEnd = Math.min(endOffset, length / 3);
  const ux = dx / length;
  const uy = dy / length;
  return {
    x1: a.x + ux * usableStart,
    y1: a.y + uy * usableStart,
    x2: b.x - ux * usableEnd,
    y2: b.y - uy * usableEnd,
  };
}

function wireAdminSvgInteractions() {
  const svg = document.getElementById('admin-network-svg');
  if (!svg) return;
  svg.addEventListener('wheel', (event) => {
    event.preventDefault();
    zoomAdminGraph(event.deltaY < 0 ? 0.9 : 1.1);
  });
  svg.addEventListener('mousedown', (event) => {
    const nodeGroup = event.target.closest?.('.admin-node');
    if (nodeGroup) {
      adminState.draggingNode = nodeGroup.getAttribute('data-node-id');
      return;
    }
    adminState.panning = { x: event.clientX, y: event.clientY, viewBox: { ...adminState.viewBox } };
  });
  window.removeEventListener('mousemove', adminSvgMove);
  window.addEventListener('mousemove', adminSvgMove);
  window.removeEventListener('mouseup', clearAdminSvgInteraction);
  window.addEventListener('mouseup', clearAdminSvgInteraction);
  svg.querySelectorAll('.admin-node').forEach((node) => {
    node.addEventListener('click', () => showAdminNodeDetails(node.getAttribute('data-node-id')));
  });
}

function clearAdminSvgInteraction() {
  adminState.draggingNode = null;
  adminState.panning = null;
}

function svgPoint(event) {
  const svg = document.getElementById('admin-network-svg');
  const rect = svg.getBoundingClientRect();
  return {
    x: adminState.viewBox.x + ((event.clientX - rect.left) / rect.width) * adminState.viewBox.w,
    y: adminState.viewBox.y + ((event.clientY - rect.top) / rect.height) * adminState.viewBox.h,
  };
}

function adminSvgMove(event) {
  if (adminState.draggingNode) {
    adminState.nodePositions.set(adminState.draggingNode, svgPoint(event));
    document.querySelector('.admin-graph-shell').innerHTML = adminGraphSvg();
    wireAdminSvgInteractions();
  } else if (adminState.panning) {
    const svg = document.getElementById('admin-network-svg');
    const rect = svg?.getBoundingClientRect();
    const dx = rect?.width ? ((event.clientX - adminState.panning.x) / rect.width) * adminState.viewBox.w : 0;
    const dy = rect?.height
      ? ((event.clientY - adminState.panning.y) / rect.height) * adminState.viewBox.h
      : 0;
    adminState.viewBox = {
      ...adminState.panning.viewBox,
      x: adminState.panning.viewBox.x - dx,
      y: adminState.panning.viewBox.y - dy,
    };
    document
      .getElementById('admin-network-svg')
      ?.setAttribute(
        'viewBox',
        `${adminState.viewBox.x} ${adminState.viewBox.y} ${adminState.viewBox.w} ${adminState.viewBox.h}`,
      );
  }
}

function zoomAdminGraph(factor) {
  adminState.viewBox = {
    x: adminState.viewBox.x + (adminState.viewBox.w * (1 - factor)) / 2,
    y: adminState.viewBox.y + (adminState.viewBox.h * (1 - factor)) / 2,
    w: adminState.viewBox.w * factor,
    h: adminState.viewBox.h * factor,
  };
  document
    .getElementById('admin-network-svg')
    ?.setAttribute(
      'viewBox',
      `${adminState.viewBox.x} ${adminState.viewBox.y} ${adminState.viewBox.w} ${adminState.viewBox.h}`,
    );
}

function fitAdminGraph() {
  resetAdminGraphViewBox();
  document
    .getElementById('admin-network-svg')
    ?.setAttribute('viewBox', `0 0 ${adminState.viewBox.w} ${adminState.viewBox.h}`);
}

async function visualiseAdminRoute() {
  const source = document.getElementById('admin-source-station')?.value.trim().toUpperCase();
  const destination = document.getElementById('admin-destination-station')?.value.trim().toUpperCase();
  const message = document.getElementById('admin-graph-message');
  adminState.selectedSource = source || adminState.selectedSource;
  adminState.selectedDestination = destination || adminState.selectedDestination;
  if (!source || !destination || source === destination) {
    if (message) {
      message.textContent =
        source === destination
          ? 'Source and destination must differ.'
          : 'Select both source and destination.';
      message.classList.remove('hidden');
    }
    return;
  }
  try {
    const json = await adminFetch(
      `/api/admin/graph/route?source=${encodeURIComponent(source)}&destination=${encodeURIComponent(destination)}&mode=shortest`,
    );
    adminState.route = json.data.available ? json.data : null;
    renderAdminGraphPanel();
    if (!json.data.available) {
      const nextMessage = document.getElementById('admin-graph-message');
      if (nextMessage) {
        nextMessage.textContent = json.data.reason || 'No route available in the current database.';
        nextMessage.classList.remove('hidden');
      }
      return;
    }
    renderRouteDetails(json.data);
  } catch (error) {
    if (message) {
      message.textContent = 'Route calculation failed.';
      message.classList.remove('hidden');
    }
  }
}

function renderRouteDetails(route) {
  const details = document.getElementById('admin-route-details');
  if (!details) return;
  if (!route.available) {
    details.innerHTML = `<h4>No route available</h4><p>${escapeHTML(route.reason || 'Stations are disconnected.')}</p>`;
    return;
  }
  details.innerHTML = `
    <h4>Route Details</h4>
    <div class="admin-route-metrics">
      <span>${route.totalDistanceKm} km</span>
      <span>${route.estimatedDurationMinutes} min</span>
      <span>${route.stopCount} stations</span>
      <span>${route.regionsCrossed.length} regions</span>
    </div>
    <ol class="admin-route-list">
      ${route.stations.map((station) => `<li><strong>${escapeHTML(station.code)}</strong> ${escapeHTML(station.name)}</li>`).join('')}
    </ol>
  `;
}

function showAdminNodeDetails(nodeId) {
  const node = adminState.graph?.nodes.find((n) => n.id === nodeId);
  const details = document.getElementById('admin-route-details');
  if (!node || !details) return;
  const connections = adminState.graph.edges.filter(
    (edge) => edge.source === node.id || edge.target === node.id,
  );
  details.innerHTML = `
    <h4>${escapeHTML(node.code)} - ${escapeHTML(node.name)}</h4>
    <p>${escapeHTML(node.region)} region</p>
    <p>${connections.length} direct connections</p>
    <ul class="admin-route-list">
      ${connections
        .slice(0, 12)
        .map(
          (edge) =>
            `<li>${escapeHTML(edge.sourceCode)} to ${escapeHTML(edge.targetCode)} (${edge.distanceKm} km)</li>`,
        )
        .join('')}
    </ul>
  `;
}

function activateAdminView(view) {
  const adminDash = document.getElementById('admin-dashboard');
  if (!adminDash) return;
  adminDash.querySelectorAll('.admin-nav-item').forEach((button) => {
    button.classList.toggle('active', button.getAttribute('data-admin-view') === view);
  });
  adminDash.querySelectorAll('.admin-view').forEach((panel) => panel.classList.add('hidden'));
  document.getElementById(`admin-view-${view}`)?.classList.remove('hidden');
  if (view === 'graph') loadAdminGraph();
  if (view === 'regions') loadAdminRegions();
  if (view === 'raise') loadRaiseConflict();
  if (view === 'solve') loadSolveConflict();
}

function adminSeverityBadge(severity) {
  const value = String(severity || '').toUpperCase();
  if (value === 'CRITICAL' || value === 'HIGH') return 'badge-red-light';
  if (value === 'MEDIUM') return 'badge-yellow-light';
  return 'badge-green-light';
}

function adminConflictTarget(conflict) {
  if (conflict.station_code) return conflict.station_code;
  if (conflict.from_station && conflict.to_station)
    return `${conflict.from_station} to ${conflict.to_station}`;
  return 'Network target';
}

async function loadAdminRegions() {
  const panel = document.getElementById('admin-view-regions');
  if (panel) panel.innerHTML = '';
}

async function loadRaiseConflict() {
  const panel = document.getElementById('admin-view-raise');
  if (panel) panel.innerHTML = '';
}

async function loadSolveConflict() {
  const panel = document.getElementById('admin-view-solve');
  if (panel) panel.innerHTML = '';
}

function initMobileDrawer() {
  const menuBtn = document.getElementById('menu-toggle-btn');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');

  if (menuBtn) {
    menuBtn.addEventListener('click', () => {
      sidebar.classList.toggle('active');
      overlay.classList.toggle('active');
    });
  }

  if (overlay) {
    overlay.addEventListener('click', closeMobileDrawer);
  }
}

function closeMobileDrawer() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar) sidebar.classList.remove('active');
  if (overlay) overlay.classList.remove('active');
}

/* ==========================================================================
   Utility Helpers
   ========================================================================== */
function formatTime(timeVal) {
  if (!timeVal) return '--:--';
  const str = String(timeVal).trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
    return new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' }).format(new Date(str));
  }
  const parts = str.split(':');
  if (parts.length >= 2) {
    let hours = parseInt(parts[0], 10);
    const mins = parts[1];
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${mins} ${ampm}`;
  }
  return str;
}

function formatDateTime(value) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat([], {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
