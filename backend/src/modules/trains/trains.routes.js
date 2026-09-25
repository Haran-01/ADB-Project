import { Router } from 'express';
import { z } from 'zod';
import { idSchema, pageSchema } from '../common/read-model.js';
import { DistributedQueryEngine } from '../../db/distributed.js';

const trainRefSchema = z.string().trim().min(1).max(40);
const liveQuerySchema = z
  .object({
    service_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    time: z
      .string()
      .regex(/^\d{2}:\d{2}(:\d{2})?$/)
      .optional(),
    server_time: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

const DEFAULT_RAILWAY_TIMEZONE = 'Asia/Kolkata';
const EVENT_TOLERANCE_BEFORE_MS = 6 * 60 * 60 * 1000;
const EVENT_TOLERANCE_AFTER_MS = 12 * 60 * 60 * 1000;

export function isClosedHours(timeStr) {
  let t = timeStr ? String(timeStr).trim() : null;
  if (!t) {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    t = `${hh}:${mm}:${ss}`;
  }
  if (t.length === 5) t = `${t}:00`;
  return t < '05:00:00' || t >= '23:00:00';
}

export function calculateStopActualTime(timeStr, delayMinutes = 0) {
  if (!timeStr) return null;
  const cleanStr = String(timeStr).trim();
  if (!delayMinutes || delayMinutes === 0) return cleanStr;

  const parts = cleanStr.split(':').map(Number);
  const h = parts[0] || 0;
  const m = parts[1] || 0;
  const s = parts[2] || 0;

  let totalMinutes = h * 60 + m + delayMinutes;
  let newH = Math.floor(totalMinutes / 60) % 24;
  let newM = totalMinutes % 60;

  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function normalizeTime(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const match = raw.match(/^(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  return `${match[1]}:${match[2]}:${match[3] ?? '00'}`;
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + Number(minutes || 0) * 60000);
}

function getTimeZoneParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
}

function dateInTimeZone(date, timeZone) {
  const p = getTimeZoneParts(date, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

function getTimeZoneOffsetMs(date, timeZone) {
  const p = getTimeZoneParts(date, timeZone);
  const localAsUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return localAsUtc - date.getTime();
}

function zonedDateTimeToUtc(dateString, timeString, timeZone) {
  const [hours, minutes, seconds] = normalizeTime(timeString).split(':').map(Number);
  const [year, month, day] = dateString.split('-').map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
  const firstPass = new Date(utcGuess.getTime() - getTimeZoneOffsetMs(utcGuess, timeZone));
  return new Date(utcGuess.getTime() - getTimeZoneOffsetMs(firstPass, timeZone));
}

function dateValueInTimeZone(value, timeZone) {
  if (!value) return null;
  if (value instanceof Date) return dateInTimeZone(value, timeZone);
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw.slice(0, 10) : dateInTimeZone(parsed, timeZone);
}

function isoOrNull(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function stationSummary(stop) {
  if (!stop) return null;
  return {
    stop_sequence: stop.stop_sequence,
    station_id: stop.station_id,
    station_code: stop.station_code,
    station_name: stop.station_name,
    platform: stop.platform,
    scheduled_arrival: stop.scheduled_arrival,
    scheduled_departure: stop.scheduled_departure,
    scheduled_arrival_at: stop.scheduled_arrival_at,
    scheduled_departure_at: stop.scheduled_departure_at,
    effective_arrival_at: stop.effective_arrival_at,
    effective_departure_at: stop.effective_departure_at,
  };
}

function eventIsCredible({ currentStop, nextStop, journey, nowMs }) {
  if (!currentStop || !nextStop || !journey?.actual_departure) return false;
  if (journey.next_station_id && String(journey.next_station_id) !== String(nextStop.station_id))
    return false;
  const actualDepartureMs = new Date(journey.actual_departure).getTime();
  const scheduledDepartureMs = currentStop.effective_departure_ms ?? currentStop.effective_arrival_ms;
  const nextArrivalMs = nextStop.effective_arrival_ms ?? nextStop.effective_departure_ms;
  if (![actualDepartureMs, scheduledDepartureMs, nextArrivalMs].every(Number.isFinite)) return false;
  if (actualDepartureMs > nowMs) return false;
  if (scheduledDepartureMs > nowMs + 5 * 60000) return false;
  return (
    actualDepartureMs >= scheduledDepartureMs - EVENT_TOLERANCE_BEFORE_MS &&
    actualDepartureMs <= nextArrivalMs + EVENT_TOLERANCE_AFTER_MS
  );
}

function buildLiveTrackPayload({ train, stops, journey, now, serviceDate, timezone }) {
  const delayMinutes = Number(journey?.delay_minutes ?? 0);
  let lastScheduledMs = null;
  let lastEffectiveMs = null;

  const route = stops.map((stop) => {
    const arrivalTime = normalizeTime(stop.scheduled_arrival);
    const departureTime = normalizeTime(stop.scheduled_departure);
    const arrivalDate = arrivalTime ? addDays(serviceDate, stop.day_offset ?? 0) : null;
    const departureDate = departureTime ? addDays(serviceDate, stop.day_offset ?? 0) : null;
    let scheduledArrival = arrivalTime ? zonedDateTimeToUtc(arrivalDate, arrivalTime, timezone) : null;
    let scheduledDeparture = departureTime
      ? zonedDateTimeToUtc(departureDate, departureTime, timezone)
      : null;

    while (scheduledArrival && lastScheduledMs != null && scheduledArrival.getTime() < lastScheduledMs) {
      scheduledArrival = addMinutes(scheduledArrival, 24 * 60);
    }
    if (scheduledArrival) lastScheduledMs = scheduledArrival.getTime();
    while (scheduledDeparture && lastScheduledMs != null && scheduledDeparture.getTime() < lastScheduledMs) {
      scheduledDeparture = addMinutes(scheduledDeparture, 24 * 60);
    }
    if (scheduledDeparture) lastScheduledMs = scheduledDeparture.getTime();

    let effectiveArrival = scheduledArrival ? addMinutes(scheduledArrival, delayMinutes) : null;
    let effectiveDeparture = scheduledDeparture ? addMinutes(scheduledDeparture, delayMinutes) : null;

    while (effectiveArrival && lastEffectiveMs != null && effectiveArrival.getTime() < lastEffectiveMs) {
      effectiveArrival = addMinutes(effectiveArrival, 24 * 60);
    }
    if (effectiveArrival) lastEffectiveMs = effectiveArrival.getTime();
    while (effectiveDeparture && lastEffectiveMs != null && effectiveDeparture.getTime() < lastEffectiveMs) {
      effectiveDeparture = addMinutes(effectiveDeparture, 24 * 60);
    }
    if (effectiveDeparture) lastEffectiveMs = effectiveDeparture.getTime();

    const actualArrival =
      journey?.current_station_id && String(journey.current_station_id) === String(stop.station_id)
        ? isoOrNull(journey.actual_arrival)
        : null;
    const actualDeparture =
      journey?.current_station_id && String(journey.current_station_id) === String(stop.station_id)
        ? isoOrNull(journey.actual_departure)
        : null;

    return {
      ...stop,
      scheduled_arrival: arrivalTime,
      scheduled_departure: departureTime,
      scheduled_arrival_at: isoOrNull(scheduledArrival),
      scheduled_departure_at: isoOrNull(scheduledDeparture),
      effective_arrival_at: isoOrNull(effectiveArrival),
      effective_departure_at: isoOrNull(effectiveDeparture),
      effective_arrival_ms: effectiveArrival?.getTime() ?? null,
      effective_departure_ms: effectiveDeparture?.getTime() ?? null,
      actual_arrival: actualArrival,
      actual_departure: actualDeparture,
      delay_minutes: delayMinutes,
    };
  });

  const nowMs = now.getTime();
  const firstStop = route[0] ?? null;
  const lastStop = route[route.length - 1] ?? null;
  const firstDepartureMs = firstStop?.effective_departure_ms ?? firstStop?.effective_arrival_ms;
  const lastArrivalMs = lastStop?.effective_arrival_ms ?? lastStop?.effective_departure_ms;
  let currentStatus = 'NOT_STARTED';
  let previousStop = null;
  let currentStop = firstStop;
  let nextStop = route[1] ?? null;
  let segmentStartMs = firstDepartureMs;
  let segmentEndMs = route[1]?.effective_arrival_ms ?? firstDepartureMs;
  let segmentProgress = 0;
  let positionSource = 'SCHEDULE_ESTIMATE';
  let positionLabel = 'Estimated Position';

  if (route.length === 0) {
    currentStatus = 'NO_ROUTE';
  } else if (firstDepartureMs == null || nowMs < firstDepartureMs) {
    currentStatus = 'NOT_STARTED';
  } else if (lastArrivalMs != null && nowMs >= lastArrivalMs) {
    currentStatus = 'DESTINATION_REACHED';
    previousStop = route[route.length - 2] ?? null;
    currentStop = lastStop;
    nextStop = null;
    segmentStartMs = lastArrivalMs;
    segmentEndMs = lastArrivalMs;
    segmentProgress = 1;
  } else {
    currentStatus = 'RUNNING';
    for (let index = 0; index < route.length; index++) {
      const stop = route[index];
      const next = route[index + 1] ?? null;
      const arrivalMs = stop.effective_arrival_ms;
      const departureMs = stop.effective_departure_ms ?? arrivalMs;
      const nextArrivalMs = next?.effective_arrival_ms ?? next?.effective_departure_ms;

      if (arrivalMs != null && departureMs != null && nowMs >= arrivalMs && nowMs < departureMs) {
        previousStop = route[index - 1] ?? null;
        currentStop = stop;
        nextStop = next;
        segmentStartMs = departureMs;
        segmentEndMs = nextArrivalMs ?? departureMs;
        segmentProgress = 0;
        break;
      }

      if (departureMs != null && nextArrivalMs != null && nowMs >= departureMs && nowMs < nextArrivalMs) {
        previousStop = stop;
        currentStop = null;
        nextStop = next;
        segmentStartMs = departureMs;
        segmentEndMs = nextArrivalMs;
        segmentProgress = (nowMs - departureMs) / Math.max(1, nextArrivalMs - departureMs);
        break;
      }
    }
  }

  const journeyStopIndex = journey?.current_station_id
    ? route.findIndex((stop) => String(stop.station_id) === String(journey.current_station_id))
    : -1;
  const journeyCurrentStop = journeyStopIndex >= 0 ? route[journeyStopIndex] : null;
  const journeyNextStop = journeyStopIndex >= 0 ? route[journeyStopIndex + 1] : null;
  if (
    currentStatus === 'RUNNING' &&
    eventIsCredible({ currentStop: journeyCurrentStop, nextStop: journeyNextStop, journey, nowMs })
  ) {
    const actualDepartureMs = new Date(journey.actual_departure).getTime();
    const scheduledSegmentMs = Math.max(
      1,
      (journeyNextStop.effective_arrival_ms ?? actualDepartureMs) -
        (journeyCurrentStop.effective_departure_ms ?? actualDepartureMs),
    );
    previousStop = journeyCurrentStop;
    currentStop = null;
    nextStop = journeyNextStop;
    segmentStartMs = actualDepartureMs;
    segmentEndMs = Math.max(
      journeyNextStop.effective_arrival_ms ?? 0,
      actualDepartureMs + scheduledSegmentMs,
    );
    segmentProgress = (nowMs - segmentStartMs) / Math.max(1, segmentEndMs - segmentStartMs);
    positionSource = 'CONFIRMED_EVENT';
    positionLabel = 'Estimated Position';
  }

  segmentProgress = Math.min(1, Math.max(0, Number.isFinite(segmentProgress) ? segmentProgress : 0));

  const annotatedRoute = route.map((stop) => {
    let status = 'Upcoming';
    let badgeClass = 'badge-upcoming';
    const departureMs = stop.effective_departure_ms ?? stop.effective_arrival_ms;
    const arrivalMs = stop.effective_arrival_ms ?? stop.effective_departure_ms;

    if (currentStatus === 'DESTINATION_REACHED') {
      if (stop.stop_sequence === lastStop?.stop_sequence) {
        status = 'Reached';
        badgeClass = 'badge-reached';
      } else {
        status = 'Passed';
        badgeClass = 'badge-passed';
      }
    } else if (currentStatus === 'RUNNING') {
      if (departureMs != null && nowMs >= departureMs) {
        status = 'Passed';
        badgeClass = 'badge-passed';
      }
      if (currentStop?.stop_sequence === stop.stop_sequence) {
        status = 'Current';
        badgeClass = 'badge-current';
      }
      if (arrivalMs != null && currentStop == null && nextStop?.stop_sequence === stop.stop_sequence) {
        status = 'Upcoming';
        badgeClass = 'badge-upcoming';
      }
    }

    return {
      ...stop,
      status,
      badgeClass,
    };
  });

  return {
    train: {
      id: train.id,
      train_number: train.train_number,
      name: train.name,
      train_type: train.train_type,
      priority: train.priority,
      status: train.status,
      source_station_id: train.source_station_id,
      source_code: train.source_code,
      source_name: train.source_name,
      dest_station_id: train.dest_station_id,
      dest_code: train.dest_code,
      dest_name: train.dest_name,
    },
    service_date: serviceDate,
    timezone,
    server_time: now.toISOString(),
    last_updated_time: new Date().toISOString(),
    route: annotatedRoute,
    stops: annotatedRoute,
    current_status: currentStatus,
    running_status:
      currentStatus === 'NOT_STARTED'
        ? 'Not Started'
        : currentStatus === 'DESTINATION_REACHED'
          ? 'Destination Reached'
          : currentStatus === 'RUNNING'
            ? 'Running'
            : 'No Route',
    previous_station: stationSummary(previousStop),
    current_station: stationSummary(currentStop),
    next_station: stationSummary(nextStop),
    segment: {
      from_station: stationSummary(previousStop ?? currentStop),
      to_station: stationSummary(nextStop ?? currentStop),
      start_time: segmentStartMs ? new Date(segmentStartMs).toISOString() : null,
      end_time: segmentEndMs ? new Date(segmentEndMs).toISOString() : null,
      progress: segmentProgress,
    },
    segment_progress: segmentProgress,
    delay_minutes: delayMinutes,
    delay: { minutes: delayMinutes },
    position_source: positionSource,
    position_label: positionLabel,
    live_available: positionSource === 'GPS_LIVE',
    live_message: positionLabel,
    journey: journey ?? null,
    moving_after_stop_sequence:
      currentStatus === 'RUNNING' && (previousStop ?? currentStop)?.stop_sequence
        ? (previousStop ?? currentStop).stop_sequence
        : null,
  };
}

function stationTerms(value) {
  const term = String(value ?? '').trim();
  if (!term) return [];
  const terms = new Set([term, term.toUpperCase()]);
  if (/chennai/i.test(term) || term.toUpperCase() === 'MAS') {
    terms.add('MAS');
    terms.add('MS');
    terms.add('Chennai');
  }
  if (/bangalore|bengaluru/i.test(term) || term.toUpperCase() === 'SBC') {
    terms.add('SBC');
    terms.add('Bangalore');
    terms.add('Bengaluru');
  }
  return [...terms];
}

function stationMatches(stop, terms) {
  const code = String(stop.station_code ?? '').toUpperCase();
  const name = String(stop.station_name ?? '').toLowerCase();
  return terms.some((term) => {
    const normalized = String(term).trim();
    return code === normalized.toUpperCase() || name.includes(normalized.toLowerCase());
  });
}

function stationSearchTerms(value) {
  const term = String(value ?? '').trim();
  if (!term) return [];
  return /^[A-Z0-9]{2,10}$/i.test(term) ? [term] : stationTerms(term);
}

function compareTime(a, b) {
  return String(a ?? '99:99:99').localeCompare(String(b ?? '99:99:99'));
}

function regionCode(fragment) {
  return (
    { south: 'SOUTH', central: 'CENTRAL', north: 'NORTH' }[fragment] ?? String(fragment ?? '').toUpperCase()
  );
}

function trainStatus(train) {
  if (train.journey_status) return String(train.journey_status);
  if (train.status === 'RUNNING') return 'RUNNING';
  return String(train.status ?? 'SCHEDULED');
}

function trainCardFromSchedule(train, fromStop = null, toStop = null) {
  const schedules = Array.isArray(train.schedules) ? train.schedules : [];
  const firstStop = fromStop ?? schedules[0] ?? {};
  const lastStop = toStop ?? schedules[schedules.length - 1] ?? firstStop;
  return {
    id: train.id,
    train_number: train.train_number,
    name: train.name,
    train_type: train.train_type,
    priority: train.priority,
    source_code: firstStop.station_code ?? null,
    source_name: firstStop.station_name ?? null,
    dest_code: lastStop.station_code ?? null,
    dest_name: lastStop.station_name ?? null,
    region_code: regionCode(train.train_region_fragment),
    source_fragment: train.train_region_fragment,
    departure_time: normalizeTime(firstStop.scheduled_departure ?? firstStop.scheduled_arrival),
    arrival_time: normalizeTime(lastStop.scheduled_arrival ?? lastStop.scheduled_departure),
    platform: firstStop.platform ?? null,
    source_seq: firstStop.stop_sequence ?? null,
    dest_seq: lastStop.stop_sequence ?? null,
    route_stops: schedules.length,
    operating_days: 'Runs Daily',
    status: trainStatus(train),
  };
}

async function distributedTrainCards(
  pool,
  { limit, offset, sort = 'earliest', region = 'ALL', time = null } = {},
) {
  const engine = new DistributedQueryEngine(pool);
  const joined = await engine.crossFragmentJoinTrainSchedules();
  let rows = joined
    .filter((train) => Array.isArray(train.schedules) && train.schedules.length > 0)
    .map((train) => trainCardFromSchedule(train));

  if (region && region !== 'ALL') rows = rows.filter((row) => row.region_code === region);
  if (time) {
    const normalizedTime = normalizeTime(time);
    rows = rows.filter((row) => !row.departure_time || row.departure_time >= normalizedTime);
  }

  rows.sort((a, b) => {
    if (sort === 'latest')
      return compareTime(b.departure_time, a.departure_time) || a.train_number.localeCompare(b.train_number);
    if (sort === 'number') return a.train_number.localeCompare(b.train_number);
    return compareTime(a.departure_time, b.departure_time) || a.train_number.localeCompare(b.train_number);
  });

  return rows.slice(offset, offset + limit);
}

async function distributedRouteSearch(pool, { from, to, limit, offset }) {
  const engine = new DistributedQueryEngine(pool);
  const joined = await engine.crossFragmentJoinTrainSchedules();
  const fromTerms = stationTerms(from);
  const toTerms = stationTerms(to);
  const rows = [];

  for (const train of joined) {
    const schedules = Array.isArray(train.schedules) ? train.schedules : [];
    for (let i = 0; i < schedules.length; i++) {
      if (!stationMatches(schedules[i], fromTerms)) continue;
      for (let j = i + 1; j < schedules.length; j++) {
        if (!stationMatches(schedules[j], toTerms)) continue;
        rows.push(trainCardFromSchedule(train, schedules[i], schedules[j]));
        i = schedules.length;
        break;
      }
    }
  }

  rows.sort(
    (a, b) => compareTime(a.departure_time, b.departure_time) || a.train_number.localeCompare(b.train_number),
  );
  return rows.slice(offset, offset + limit);
}

async function distributedStationSearch(pool, { station, limit, offset }) {
  const engine = new DistributedQueryEngine(pool);
  const joined = await engine.crossFragmentJoinTrainSchedules();
  const stationTermsList = stationSearchTerms(station);
  const rows = [];

  for (const train of joined) {
    const schedules = Array.isArray(train.schedules) ? train.schedules : [];
    const matchedStop = schedules.find((stop) => stationMatches(stop, stationTermsList));
    if (!matchedStop) continue;

    rows.push({
      ...trainCardFromSchedule(train),
      station_code: matchedStop.station_code,
      station_name: matchedStop.station_name,
      station_arrival_time: normalizeTime(matchedStop.scheduled_arrival),
      station_departure_time: normalizeTime(matchedStop.scheduled_departure),
      station_stop_sequence: matchedStop.stop_sequence,
      station_direction:
        matchedStop.scheduled_arrival && matchedStop.scheduled_departure
          ? 'Incoming / Outgoing'
          : matchedStop.scheduled_arrival
            ? 'Incoming'
            : 'Outgoing',
    });
  }

  rows.sort(
    (a, b) =>
      compareTime(
        a.station_departure_time ?? a.station_arrival_time,
        b.station_departure_time ?? b.station_arrival_time,
      ) || a.train_number.localeCompare(b.train_number),
  );
  return rows.slice(offset, offset + limit);
}

async function resolveTrain(pool, ref) {
  const value = trainRefSchema.parse(ref);
  const {
    rows: [train],
  } = await pool.query(
    `select
       t.id, t.train_number, t.name, t.train_type, t.priority, t.status,
       ss.id as source_station_id, ss.station_code as source_code, ss.name as source_name,
       ds.id as dest_station_id, ds.station_code as dest_code, ds.name as dest_name
     from public.trains t
     join public.stations ss on ss.id=t.source_station_id
     join public.stations ds on ds.id=t.destination_station_id
     where t.id::text = $1 or t.train_number = $1
     limit 1`,
    [value],
  );
  return train;
}

export function trainRoutes(pool) {
  const router = Router();

  // Upcoming trains (default state for empty search inputs)
  router.get('/upcoming', async (req, res) => {
    const { limit, offset } = pageSchema.parse(req.query);
    const rows = await distributedTrainCards(pool, { limit, offset, sort: 'earliest' });
    res.json({ data: rows, limit, offset, distributed_retrieval: true });
  });

  // Search trains by source & destination station
  router.get('/search', async (req, res) => {
    const from = req.query.from ? String(req.query.from).trim() : null;
    const to = req.query.to ? String(req.query.to).trim() : null;
    const { limit, offset } = pageSchema.parse(req.query);

    // If both empty, return the full distributed train catalog for the default Search Trains state.
    if (!from && !to) {
      const rows = await distributedTrainCards(pool, { limit, offset, sort: 'earliest' });
      return res.json({ data: rows, limit, offset, is_default_catalog: true, distributed_retrieval: true });
    }

    if (!from || !to || from.toLowerCase() === to.toLowerCase()) {
      const rows = await distributedStationSearch(pool, { station: from || to, limit, offset });
      return res.json({
        data: rows,
        limit,
        offset,
        station_search: true,
        distributed_retrieval: true,
      });
    }

    const rows = await distributedRouteSearch(pool, { from, to, limit, offset });

    if (rows.length === 0) {
      return res.json({ data: [], message: 'No trains found for the selected route.' });
    }

    res.json({ data: rows, limit, offset, distributed_retrieval: true });
  });

  // All trains catalog with time filter, region filter, sorting & pagination
  router.get('/', async (req, res) => {
    const { limit, offset } = pageSchema.parse(req.query);
    const sort = req.query.sort ? String(req.query.sort).trim().toLowerCase() : 'earliest';
    const region = req.query.region ? String(req.query.region).trim().toUpperCase() : 'ALL';
    const checkTime = req.query.time ? String(req.query.time).trim() : null;

    const rows = await distributedTrainCards(pool, { limit, offset, sort, region, time: checkTime });

    res.json({
      data: rows,
      limit,
      offset,
      region,
      sort,
      time_filter: checkTime,
      distributed_retrieval: true,
    });
  });

  // Live Track endpoint: Resolves train and returns complete route sequence & live status
  router.get('/:id/live', async (req, res) => {
    const q = liveQuerySchema.parse(req.query);
    const train = await resolveTrain(pool, req.params.id);
    if (!train) return res.status(404).json({ error: 'Train not found' });

    const { rows: stops } = await pool.query(
      `select
         sch.stop_sequence,
         s.id as station_id,
         s.station_code,
         s.name as station_name,
         sch.scheduled_arrival,
         sch.scheduled_departure,
         sch.day_offset,
         sch.platform
       from public.train_schedules sch
       join public.stations s on s.id = sch.station_id
       where sch.train_id = $1
       order by sch.stop_sequence asc`,
      [train.id],
    );

    const {
      rows: [journey],
    } = await pool.query(
      `select
         tj.*,
         cs.station_code as current_station_code, cs.name as current_station_name,
         ns.station_code as next_station_code, ns.name as next_station_name
       from public.train_journeys tj
       left join public.stations cs on cs.id = tj.current_station_id
       left join public.stations ns on ns.id = tj.next_station_id
       where tj.train_id = $1
       order by tj.journey_date desc, tj.created_at desc
       limit 1`,
      [train.id],
    );

    const timezone = process.env.RAILWAY_TIMEZONE || DEFAULT_RAILWAY_TIMEZONE;
    const baseNow = q.server_time ? new Date(q.server_time) : new Date();
    const serviceDate =
      q.service_date ||
      dateValueInTimeZone(journey?.journey_date, timezone) ||
      dateInTimeZone(baseNow, timezone);
    const now = q.time ? zonedDateTimeToUtc(serviceDate, q.time, timezone) : baseNow;

    res.json({
      data: buildLiveTrackPayload({ train, stops, journey, now, serviceDate, timezone }),
    });
  });

  router.get('/:id', async (req, res) => {
    const train = await resolveTrain(pool, req.params.id);
    if (!train) return res.status(404).json({ error: 'Train not found' });
    res.json({ data: train });
  });

  router.get('/:id/status', async (req, res) => {
    const train = await resolveTrain(pool, req.params.id);
    if (!train) return res.status(404).json({ error: 'Train not found' });
    const {
      rows: [journey],
    } = await pool.query(
      `select tj.*, cs.station_code as current_station_code, cs.name as current_station_name,
        ns.station_code as next_station_code, ns.name as next_station_name
       from public.train_journeys tj
       left join public.stations cs on cs.id=tj.current_station_id
       left join public.stations ns on ns.id=tj.next_station_id
       where tj.train_id=$1
       order by tj.journey_date desc, tj.created_at desc limit 1`,
      [train.id],
    );
    res.json({
      data: {
        train,
        journey: journey ?? null,
      },
    });
  });

  router.get('/:id/schedule', async (req, res) => {
    const train = await resolveTrain(pool, req.params.id);
    if (!train) return res.status(404).json({ error: 'Train not found' });
    const { rows } = await pool.query(
      `select sch.stop_sequence, s.station_code, s.name as station_name, sch.scheduled_arrival, sch.scheduled_departure, sch.platform
       from public.train_schedules sch
       join public.stations s on s.id=sch.station_id
       where sch.train_id=$1
       order by sch.stop_sequence asc`,
      [train.id],
    );
    res.json({ data: { train, schedule: rows } });
  });

  return router;
}
