-- Phase 4 seed: realistic Southern Railway demo network.
-- Repeatable seed file. It clears project data tables but preserves migrations.

begin;

set search_path to railway_main, extensions, public;

truncate table
  railway_main.route_recommendations,
  railway_main.affected_trains,
  railway_main.event_log,
  railway_main.disruption_history,
  railway_main.journey_delay_history,
  railway_main.train_status_history,
  railway_main.track_status_history,
  railway_main.disruptions,
  railway_main.train_journeys,
  railway_main.train_schedules,
  railway_main.trains,
  railway_main.tracks,
  railway_main.stations,
  railway_main.regions
cascade;

insert into railway_main.regions (code, name, description)
values
  ('SR', 'Southern Railway Demo Region', 'Simulation region covering Tamil Nadu and nearby operational corridors.');

with station_data(station_code, name, zone, state, latitude, longitude, status) as (
  values
    ('MAS', 'MGR Chennai Central', 'Southern Railway', 'Tamil Nadu', 13.0827, 80.2707, 'ACTIVE'),
    ('MS', 'Chennai Egmore', 'Southern Railway', 'Tamil Nadu', 13.0732, 80.2609, 'ACTIVE'),
    ('TBM', 'Tambaram', 'Southern Railway', 'Tamil Nadu', 12.9249, 80.1000, 'ACTIVE'),
    ('CGL', 'Chengalpattu Junction', 'Southern Railway', 'Tamil Nadu', 12.6819, 79.9888, 'ACTIVE'),
    ('VM', 'Villupuram Junction', 'Southern Railway', 'Tamil Nadu', 11.9401, 79.4861, 'ACTIVE'),
    ('PDY', 'Puducherry', 'Southern Railway', 'Puducherry', 11.9139, 79.8145, 'ACTIVE'),
    ('TPJ', 'Tiruchchirappalli Junction', 'Southern Railway', 'Tamil Nadu', 10.7905, 78.7047, 'ACTIVE'),
    ('TJ', 'Thanjavur Junction', 'Southern Railway', 'Tamil Nadu', 10.7867, 79.1378, 'ACTIVE'),
    ('MV', 'Mayiladuthurai Junction', 'Southern Railway', 'Tamil Nadu', 11.1018, 79.6520, 'ACTIVE'),
    ('DG', 'Dindigul Junction', 'Southern Railway', 'Tamil Nadu', 10.3673, 77.9803, 'ACTIVE'),
    ('MDU', 'Madurai Junction', 'Southern Railway', 'Tamil Nadu', 9.9252, 78.1198, 'ACTIVE'),
    ('VPT', 'Virudhunagar Junction', 'Southern Railway', 'Tamil Nadu', 9.5851, 77.9579, 'ACTIVE'),
    ('TEN', 'Tirunelveli Junction', 'Southern Railway', 'Tamil Nadu', 8.7139, 77.7567, 'ACTIVE'),
    ('NCJ', 'Nagercoil Junction', 'Southern Railway', 'Tamil Nadu', 8.1760, 77.4344, 'ACTIVE'),
    ('KRR', 'Karur Junction', 'Southern Railway', 'Tamil Nadu', 10.9601, 78.0766, 'ACTIVE'),
    ('ED', 'Erode Junction', 'Southern Railway', 'Tamil Nadu', 11.3410, 77.7172, 'ACTIVE'),
    ('TUP', 'Tiruppur', 'Southern Railway', 'Tamil Nadu', 11.1085, 77.3411, 'ACTIVE'),
    ('CBE', 'Coimbatore Junction', 'Southern Railway', 'Tamil Nadu', 11.0168, 76.9558, 'ACTIVE'),
    ('SA', 'Salem Junction', 'Southern Railway', 'Tamil Nadu', 11.6643, 78.1460, 'ACTIVE'),
    ('JTJ', 'Jolarpettai Junction', 'Southern Railway', 'Tamil Nadu', 12.5708, 78.5736, 'ACTIVE'),
    ('KPD', 'Katpadi Junction', 'Southern Railway', 'Tamil Nadu', 12.9736, 79.1378, 'ACTIVE'),
    ('AJJ', 'Arakkonam Junction', 'Southern Railway', 'Tamil Nadu', 13.0846, 79.6705, 'ACTIVE'),
    ('RU', 'Renigunta Junction', 'South Central Link', 'Andhra Pradesh', 13.6367, 79.5037, 'ACTIVE'),
    ('TPTY', 'Tirupati', 'South Central Link', 'Andhra Pradesh', 13.6288, 79.4192, 'ACTIVE'),
    ('SBC', 'KSR Bengaluru City', 'South Western Link', 'Karnataka', 12.9784, 77.5696, 'ACTIVE')
)
insert into railway_main.stations (
  station_code,
  name,
  region_id,
  zone,
  state,
  latitude,
  longitude,
  geom,
  status
)
select
  station_code,
  station_data.name,
  r.id,
  zone,
  state,
  latitude,
  longitude,
  ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography,
  status::railway_main.station_status
from station_data
cross join railway_main.regions r
where r.code = 'SR';

with undirected_tracks(from_code, to_code, distance_km, track_type, speed_limit_kmph, status) as (
  values
    ('MAS', 'AJJ', 69.00, 'DOUBLE_ELECTRIFIED', 110, 'ACTIVE'),
    ('AJJ', 'KPD', 61.00, 'DOUBLE_ELECTRIFIED', 110, 'ACTIVE'),
    ('KPD', 'JTJ', 84.00, 'DOUBLE_ELECTRIFIED', 110, 'ACTIVE'),
    ('JTJ', 'SA', 120.00, 'DOUBLE_ELECTRIFIED', 110, 'ACTIVE'),
    ('SA', 'ED', 61.00, 'DOUBLE_ELECTRIFIED', 110, 'ACTIVE'),
    ('ED', 'TUP', 51.00, 'DOUBLE_ELECTRIFIED', 100, 'ACTIVE'),
    ('TUP', 'CBE', 50.00, 'DOUBLE_ELECTRIFIED', 100, 'ACTIVE'),
    ('MS', 'TBM', 25.00, 'DOUBLE_ELECTRIFIED', 90, 'ACTIVE'),
    ('TBM', 'CGL', 31.00, 'DOUBLE_ELECTRIFIED', 100, 'ACTIVE'),
    ('CGL', 'VM', 103.00, 'DOUBLE_ELECTRIFIED', 110, 'ACTIVE'),
    ('VM', 'TPJ', 178.00, 'DOUBLE_ELECTRIFIED', 110, 'ACTIVE'),
    ('TPJ', 'DG', 94.00, 'DOUBLE_ELECTRIFIED', 100, 'ACTIVE'),
    ('DG', 'MDU', 66.00, 'DOUBLE_ELECTRIFIED', 100, 'ACTIVE'),
    ('MDU', 'VPT', 43.00, 'DOUBLE_ELECTRIFIED', 100, 'ACTIVE'),
    ('VPT', 'TEN', 113.00, 'DOUBLE_ELECTRIFIED', 100, 'ACTIVE'),
    ('TEN', 'NCJ', 74.00, 'DOUBLE_ELECTRIFIED', 90, 'ACTIVE'),
    ('VM', 'PDY', 38.00, 'SINGLE_ELECTRIFIED', 80, 'ACTIVE'),
    ('TPJ', 'TJ', 50.00, 'DOUBLE_ELECTRIFIED', 90, 'ACTIVE'),
    ('TJ', 'MV', 70.00, 'SINGLE_ELECTRIFIED', 80, 'ACTIVE'),
    ('MV', 'VM', 122.00, 'SINGLE_ELECTRIFIED', 80, 'ACTIVE'),
    ('TPJ', 'KRR', 76.00, 'DOUBLE_ELECTRIFIED', 100, 'ACTIVE'),
    ('KRR', 'ED', 66.00, 'DOUBLE_ELECTRIFIED', 100, 'ACTIVE'),
    ('SA', 'KRR', 86.00, 'SINGLE_ELECTRIFIED', 80, 'ACTIVE'),
    ('AJJ', 'RU', 74.00, 'DOUBLE_ELECTRIFIED', 100, 'ACTIVE'),
    ('RU', 'TPTY', 10.00, 'DOUBLE_ELECTRIFIED', 80, 'ACTIVE'),
    ('CGL', 'AJJ', 75.00, 'SINGLE_ELECTRIFIED', 80, 'ACTIVE'),
    ('CGL', 'KPD', 119.00, 'SINGLE_ELECTRIFIED', 80, 'ACTIVE'),
    ('JTJ', 'SBC', 145.00, 'DOUBLE_ELECTRIFIED', 110, 'ACTIVE'),
    ('DG', 'KRR', 74.00, 'SINGLE_ELECTRIFIED', 80, 'ACTIVE'),
    ('MDU', 'TEN', 156.00, 'DOUBLE_ELECTRIFIED', 100, 'MAINTENANCE')
),
directed_tracks as (
  select * from undirected_tracks
  union all
  select to_code, from_code, distance_km, track_type, speed_limit_kmph, status from undirected_tracks
)
insert into railway_main.tracks (
  from_station_id,
  to_station_id,
  region_id,
  distance_km,
  track_type,
  speed_limit_kmph,
  status,
  geom,
  valid_from,
  valid_to
)
select
  fs.id,
  ts.id,
  r.id,
  dt.distance_km,
  dt.track_type,
  dt.speed_limit_kmph,
  dt.status::railway_main.track_status,
  ST_MakeLine(fs.geom::geometry, ts.geom::geometry)::geography,
  now() - interval '30 days',
  null
from directed_tracks dt
join railway_main.stations fs on fs.station_code = dt.from_code
join railway_main.stations ts on ts.station_code = dt.to_code
join railway_main.regions r on r.code = 'SR';

with train_data(train_number, name, train_type, priority, source_code, destination_code, status) as (
  values
    ('12623', 'Chennai Central - Thiruvananthapuram Mail', 'SUPERFAST', 1, 'MAS', 'NCJ', 'RUNNING'),
    ('12671', 'Nilgiri Express Demo', 'EXPRESS', 2, 'MAS', 'CBE', 'RUNNING'),
    ('16127', 'Chennai Egmore - Guruvayur Express Demo', 'EXPRESS', 3, 'MS', 'TPJ', 'RUNNING'),
    ('16787', 'Tirunelveli Intercity Demo', 'INTERCITY', 3, 'TEN', 'MDU', 'DELAYED'),
    ('22637', 'West Coast Superfast Demo', 'SUPERFAST', 1, 'MAS', 'CBE', 'RUNNING'),
    ('16853', 'Trichy - Chennai Chord Demo', 'PASSENGER', 4, 'TPJ', 'MS', 'SCHEDULED'),
    ('20643', 'Coimbatore Intercity Demo', 'INTERCITY', 2, 'CBE', 'MAS', 'RUNNING'),
    ('12635', 'Vaigai Express Demo', 'SUPERFAST', 1, 'MS', 'MDU', 'RUNNING'),
    ('16352', 'Nagercoil Express Demo', 'EXPRESS', 3, 'NCJ', 'MS', 'RUNNING'),
    ('16219', 'Bengaluru Link Express Demo', 'EXPRESS', 3, 'SBC', 'MAS', 'RUNNING'),
    ('11021', 'Tirupati Passenger Demo', 'PASSENGER', 5, 'MAS', 'TPTY', 'SCHEDULED'),
    ('56001', 'Villupuram Puducherry Passenger Demo', 'PASSENGER', 5, 'VM', 'PDY', 'RUNNING')
)
insert into railway_main.trains (
  train_number,
  name,
  train_type,
  priority,
  source_station_id,
  destination_station_id,
  status
)
select
  td.train_number,
  td.name,
  td.train_type::railway_main.train_type,
  td.priority,
  src.id,
  dst.id,
  td.status::railway_main.train_status
from train_data td
join railway_main.stations src on src.station_code = td.source_code
join railway_main.stations dst on dst.station_code = td.destination_code;

with schedule_data(train_number, station_code, stop_sequence, scheduled_arrival, scheduled_departure, day_offset, platform) as (
  values
    ('12623', 'MAS', 1, null, '19:45'::time, 0, '4'),
    ('12623', 'AJJ', 2, '20:43'::time, '20:45'::time, 0, '2'),
    ('12623', 'KPD', 3, '21:40'::time, '21:45'::time, 0, '3'),
    ('12623', 'JTJ', 4, '23:10'::time, '23:15'::time, 0, '1'),
    ('12623', 'SA', 5, '01:20'::time, '01:25'::time, 1, '4'),
    ('12623', 'ED', 6, '02:20'::time, '02:25'::time, 1, '1'),
    ('12623', 'KRR', 7, '03:35'::time, '03:40'::time, 1, '2'),
    ('12623', 'TPJ', 8, '05:00'::time, '05:10'::time, 1, '5'),
    ('12623', 'DG', 9, '06:35'::time, '06:40'::time, 1, '2'),
    ('12623', 'MDU', 10, '07:45'::time, '07:50'::time, 1, '3'),
    ('12623', 'VPT', 11, '08:35'::time, '08:37'::time, 1, '1'),
    ('12623', 'TEN', 12, '10:25'::time, '10:30'::time, 1, '2'),
    ('12623', 'NCJ', 13, '12:10'::time, null, 1, '1'),

    ('12671', 'MAS', 1, null, '21:05'::time, 0, '6'),
    ('12671', 'AJJ', 2, '22:05'::time, '22:07'::time, 0, '2'),
    ('12671', 'KPD', 3, '23:05'::time, '23:10'::time, 0, '3'),
    ('12671', 'JTJ', 4, '00:35'::time, '00:40'::time, 1, '1'),
    ('12671', 'SA', 5, '02:40'::time, '02:45'::time, 1, '4'),
    ('12671', 'ED', 6, '03:40'::time, '03:45'::time, 1, '1'),
    ('12671', 'TUP', 7, '04:30'::time, '04:32'::time, 1, '1'),
    ('12671', 'CBE', 8, '05:20'::time, null, 1, '3'),

    ('16127', 'MS', 1, null, '08:15'::time, 0, '5'),
    ('16127', 'TBM', 2, '08:45'::time, '08:47'::time, 0, '3'),
    ('16127', 'CGL', 3, '09:20'::time, '09:25'::time, 0, '2'),
    ('16127', 'VM', 4, '11:05'::time, '11:10'::time, 0, '4'),
    ('16127', 'TPJ', 5, '14:25'::time, null, 0, '6'),

    ('16787', 'TEN', 1, null, '06:15'::time, 0, '1'),
    ('16787', 'VPT', 2, '08:10'::time, '08:12'::time, 0, '1'),
    ('16787', 'MDU', 3, '09:05'::time, null, 0, '2'),

    ('22637', 'MAS', 1, null, '06:10'::time, 0, '7'),
    ('22637', 'AJJ', 2, '07:05'::time, '07:07'::time, 0, '1'),
    ('22637', 'KPD', 3, '08:00'::time, '08:05'::time, 0, '3'),
    ('22637', 'JTJ', 4, '09:20'::time, '09:22'::time, 0, '1'),
    ('22637', 'SA', 5, '11:30'::time, '11:35'::time, 0, '4'),
    ('22637', 'ED', 6, '12:30'::time, '12:35'::time, 0, '1'),
    ('22637', 'TUP', 7, '13:20'::time, '13:22'::time, 0, '1'),
    ('22637', 'CBE', 8, '14:15'::time, null, 0, '2'),

    ('16853', 'TPJ', 1, null, '07:20'::time, 0, '4'),
    ('16853', 'TJ', 2, '08:05'::time, '08:10'::time, 0, '2'),
    ('16853', 'MV', 3, '09:25'::time, '09:30'::time, 0, '1'),
    ('16853', 'VM', 4, '11:35'::time, '11:40'::time, 0, '3'),
    ('16853', 'CGL', 5, '13:25'::time, '13:30'::time, 0, '2'),
    ('16853', 'TBM', 6, '14:05'::time, '14:07'::time, 0, '3'),
    ('16853', 'MS', 7, '14:45'::time, null, 0, '5'),

    ('20643', 'CBE', 1, null, '15:20'::time, 0, '3'),
    ('20643', 'TUP', 2, '16:05'::time, '16:07'::time, 0, '1'),
    ('20643', 'ED', 3, '16:55'::time, '17:00'::time, 0, '1'),
    ('20643', 'SA', 4, '18:00'::time, '18:05'::time, 0, '4'),
    ('20643', 'JTJ', 5, '20:05'::time, '20:10'::time, 0, '1'),
    ('20643', 'KPD', 6, '21:25'::time, '21:30'::time, 0, '3'),
    ('20643', 'AJJ', 7, '22:25'::time, '22:27'::time, 0, '1'),
    ('20643', 'MAS', 8, '23:30'::time, null, 0, '5'),

    ('12635', 'MS', 1, null, '13:45'::time, 0, '6'),
    ('12635', 'TBM', 2, '14:15'::time, '14:17'::time, 0, '3'),
    ('12635', 'CGL', 3, '14:50'::time, '14:55'::time, 0, '2'),
    ('12635', 'VM', 4, '16:35'::time, '16:40'::time, 0, '4'),
    ('12635', 'TPJ', 5, '19:55'::time, '20:05'::time, 0, '5'),
    ('12635', 'DG', 6, '21:30'::time, '21:35'::time, 0, '2'),
    ('12635', 'MDU', 7, '22:40'::time, null, 0, '3'),

    ('16352', 'NCJ', 1, null, '17:10'::time, 0, '1'),
    ('16352', 'TEN', 2, '18:45'::time, '18:50'::time, 0, '2'),
    ('16352', 'VPT', 3, '20:40'::time, '20:42'::time, 0, '1'),
    ('16352', 'MDU', 4, '21:30'::time, '21:35'::time, 0, '3'),
    ('16352', 'DG', 5, '22:40'::time, '22:45'::time, 0, '2'),
    ('16352', 'TPJ', 6, '00:10'::time, '00:20'::time, 1, '5'),
    ('16352', 'VM', 7, '03:25'::time, '03:30'::time, 1, '4'),
    ('16352', 'CGL', 8, '05:15'::time, '05:20'::time, 1, '2'),
    ('16352', 'TBM', 9, '05:55'::time, '05:57'::time, 1, '3'),
    ('16352', 'MS', 10, '06:35'::time, null, 1, '5'),

    ('16219', 'SBC', 1, null, '08:00'::time, 0, '6'),
    ('16219', 'JTJ', 2, '10:35'::time, '10:40'::time, 0, '2'),
    ('16219', 'KPD', 3, '11:55'::time, '12:00'::time, 0, '3'),
    ('16219', 'AJJ', 4, '12:55'::time, '12:57'::time, 0, '2'),
    ('16219', 'MAS', 5, '14:00'::time, null, 0, '5'),

    ('11021', 'MAS', 1, null, '05:40'::time, 0, '3'),
    ('11021', 'AJJ', 2, '06:40'::time, '06:42'::time, 0, '2'),
    ('11021', 'RU', 3, '08:05'::time, '08:10'::time, 0, '1'),
    ('11021', 'TPTY', 4, '08:35'::time, null, 0, '1'),

    ('56001', 'VM', 1, null, '17:30'::time, 0, '1'),
    ('56001', 'PDY', 2, '18:25'::time, null, 0, '1')
)
insert into railway_main.train_schedules (
  train_id,
  station_id,
  stop_sequence,
  scheduled_arrival,
  scheduled_departure,
  day_offset,
  platform
)
select
  t.id,
  s.id,
  sd.stop_sequence,
  sd.scheduled_arrival,
  sd.scheduled_departure,
  sd.day_offset,
  sd.platform
from schedule_data sd
join railway_main.trains t on t.train_number = sd.train_number
join railway_main.stations s on s.station_code = sd.station_code;

with journey_data(train_number, journey_date, current_code, next_code, actual_arrival, actual_departure, delay_minutes, journey_status) as (
  values
    ('12623', current_date, 'ED', 'KRR', now() - interval '20 minutes', now() - interval '12 minutes', 12, 'RUNNING'),
    ('12671', current_date, 'JTJ', 'SA', now() - interval '55 minutes', now() - interval '50 minutes', 0, 'RUNNING'),
    ('16127', current_date, 'CGL', 'VM', now() - interval '35 minutes', now() - interval '30 minutes', 8, 'RUNNING'),
    ('16787', current_date, 'VPT', 'MDU', now() - interval '18 minutes', now() - interval '15 minutes', 22, 'DELAYED'),
    ('22637', current_date, 'KPD', 'JTJ', now() - interval '25 minutes', now() - interval '20 minutes', 0, 'RUNNING'),
    ('16853', current_date, 'TJ', 'MV', now() - interval '15 minutes', now() - interval '10 minutes', 5, 'RUNNING'),
    ('20643', current_date, 'ED', 'SA', now() - interval '22 minutes', now() - interval '17 minutes', 0, 'RUNNING'),
    ('12635', current_date, 'VM', 'TPJ', now() - interval '40 minutes', now() - interval '35 minutes', 0, 'RUNNING'),
    ('16352', current_date, 'TEN', 'VPT', now() - interval '30 minutes', now() - interval '25 minutes', 15, 'RUNNING'),
    ('16219', current_date, 'JTJ', 'KPD', now() - interval '28 minutes', now() - interval '23 minutes', 0, 'RUNNING'),
    ('11021', current_date, 'MAS', 'AJJ', null, now() - interval '5 minutes', 0, 'RUNNING'),
    ('56001', current_date, 'VM', 'PDY', null, now() - interval '8 minutes', 0, 'RUNNING')
)
insert into railway_main.train_journeys (
  train_id,
  journey_date,
  current_station_id,
  next_station_id,
  actual_arrival,
  actual_departure,
  delay_minutes,
  journey_status
)
select
  t.id,
  jd.journey_date,
  cs.id,
  ns.id,
  jd.actual_arrival,
  jd.actual_departure,
  jd.delay_minutes,
  jd.journey_status::railway_main.journey_status
from journey_data jd
join railway_main.trains t on t.train_number = jd.train_number
left join railway_main.stations cs on cs.station_code = jd.current_code
left join railway_main.stations ns on ns.station_code = jd.next_code;

insert into railway_main.track_status_history (track_id, old_status, new_status, changed_at, changed_by, reason)
select id, null, status, now() - interval '30 days', 'seed', 'Initial demo track status'
from railway_main.tracks;

insert into railway_main.train_status_history (train_id, old_status, new_status, changed_at, changed_by, reason)
select id, null, status, now() - interval '1 day', 'seed', 'Initial demo train status'
from railway_main.trains;

insert into railway_main.journey_delay_history (train_journey_id, old_delay_minutes, new_delay_minutes, changed_at, changed_by, reason)
select id, null, delay_minutes, now() - interval '30 minutes', 'seed', 'Initial simulated delay state'
from railway_main.train_journeys
where delay_minutes > 0;

with disruption_data(type, track_from, track_to, station_code, severity, reported_by, description, started_at, ended_at, status) as (
  values
    ('MAINTENANCE', 'MDU', 'TEN', null, 'MEDIUM', 'seed-system', 'Planned maintenance block between Madurai and Tirunelveli direct corridor.', now() - interval '3 hours', null, 'OPEN'),
    ('TRACK_FAILURE', 'CGL', 'VM', null, 'HIGH', 'control-room', 'Signal and track circuit failure near Chengalpattu - Villupuram section.', now() - interval '45 minutes', null, 'ANALYZING'),
    ('STATION_CLOSURE', null, null, 'PDY', 'LOW', 'station-master', 'Platform inspection window at Puducherry station.', now() - interval '2 hours', now() - interval '1 hour', 'RESOLVED')
),
resolved_disruptions as (
  select
    dd.*,
    tr.id as track_id,
    st.id as station_id,
    case
      when tr.id is not null then ST_LineInterpolatePoint(tr.geom::geometry, 0.5)::geography
      when st.id is not null then st.geom
      else null
    end as geom
  from disruption_data dd
  left join railway_main.stations fs on fs.station_code = dd.track_from
  left join railway_main.stations ts on ts.station_code = dd.track_to
  left join railway_main.tracks tr on tr.from_station_id = fs.id and tr.to_station_id = ts.id
  left join railway_main.stations st on st.station_code = dd.station_code
)
insert into railway_main.disruptions (
  type,
  track_id,
  station_id,
  severity,
  reported_by,
  description,
  started_at,
  ended_at,
  status,
  geom
)
select
  type::railway_main.disruption_type,
  track_id,
  station_id,
  severity::railway_main.disruption_severity,
  reported_by,
  description,
  started_at,
  ended_at,
  status::railway_main.disruption_status,
  geom
from resolved_disruptions;

insert into railway_main.disruption_history (disruption_id, old_status, new_status, changed_at, changed_by, note)
select id, null, status, started_at, reported_by, 'Initial seeded disruption state'
from railway_main.disruptions;

insert into railway_main.event_log (event_type, entity_type, entity_id, payload, created_at, processed_at, status)
select
  'DISRUPTION_CREATED'::railway_main.event_type,
  'disruptions',
  d.id,
  jsonb_build_object('disruption_id', d.id, 'type', d.type, 'status', d.status),
  d.created_at,
  case when d.status = 'RESOLVED'::railway_main.disruption_status then d.created_at + interval '5 minutes' else null end,
  case when d.status = 'RESOLVED'::railway_main.disruption_status then 'PROCESSED'::railway_main.event_status else 'PENDING'::railway_main.event_status end
from railway_main.disruptions d;

with active_track_failure as (
  select d.id as disruption_id
  from railway_main.disruptions d
  join railway_main.tracks tr on tr.id = d.track_id
  join railway_main.stations fs on fs.id = tr.from_station_id
  join railway_main.stations ts on ts.id = tr.to_station_id
  where fs.station_code = 'CGL'
    and ts.station_code = 'VM'
),
impacts(train_number, impact_type, delay, status) as (
  values
    ('16127', 'DIRECT_TRACK_BLOCK', 50, 'PENDING'),
    ('12635', 'DIRECT_TRACK_BLOCK', 45, 'PENDING'),
    ('16352', 'UPSTREAM_DELAY', 30, 'WAITING'),
    ('16853', 'REGIONAL_IMPACT', 20, 'WAITING')
)
insert into railway_main.affected_trains (
  disruption_id,
  train_journey_id,
  impact_type,
  estimated_delay_minutes,
  status
)
select
  atf.disruption_id,
  tj.id,
  i.impact_type::railway_main.impact_type,
  i.delay,
  i.status::railway_main.affected_train_status
from active_track_failure atf
cross join impacts i
join railway_main.trains t on t.train_number = i.train_number
join railway_main.train_journeys tj on tj.train_id = t.id and tj.journey_date = current_date;

with active_track_failure as (
  select d.id as disruption_id
  from railway_main.disruptions d
  join railway_main.tracks tr on tr.id = d.track_id
  join railway_main.stations fs on fs.id = tr.from_station_id
  join railway_main.stations ts on ts.id = tr.to_station_id
  where fs.station_code = 'CGL'
    and ts.station_code = 'VM'
),
recommendations(train_number, original_route, recommended_route, distance_km, travel_minutes, delay_minutes, score, status) as (
  values
    (
      '16127',
      '["MS","TBM","CGL","VM","TPJ"]'::jsonb,
      '["MS","TBM","CGL","KPD","JTJ","SA","KRR","TPJ"]'::jsonb,
      514.00,
      420,
      95,
      78.5000,
      'PROPOSED'
    ),
    (
      '12635',
      '["MS","TBM","CGL","VM","TPJ","DG","MDU"]'::jsonb,
      '["MS","TBM","CGL","KPD","JTJ","SA","KRR","TPJ","DG","MDU"]'::jsonb,
      674.00,
      535,
      105,
      81.2500,
      'PROPOSED'
    )
)
insert into railway_main.route_recommendations (
  disruption_id,
  train_journey_id,
  original_route,
  recommended_route,
  distance_km,
  estimated_travel_minutes,
  estimated_delay_minutes,
  score,
  status
)
select
  atf.disruption_id,
  tj.id,
  r.original_route,
  r.recommended_route,
  r.distance_km,
  r.travel_minutes,
  r.delay_minutes,
  r.score,
  r.status::railway_main.recommendation_status
from active_track_failure atf
cross join recommendations r
join railway_main.trains t on t.train_number = r.train_number
join railway_main.train_journeys tj on tj.train_id = t.id and tj.journey_date = current_date;

commit;
