-- Seed Central & Northern Regional Node Databases & Cross-Region Multi-DB Trains

begin;

-- Clean existing records in Central and Northern node tables before inserting
delete from railway_central.train_schedules;
delete from railway_central.tracks;
delete from railway_central.trains;
delete from railway_central.stations;
delete from railway_central.regions;

delete from railway_north.train_schedules;
delete from railway_north.tracks;
delete from railway_north.trains;
delete from railway_north.stations;
delete from railway_north.regions;

-- ========================================================
-- 1. CENTRAL RAILWAY NODE (railway_central)
-- ========================================================

-- Central Region
insert into railway_central.regions (id, code, name, description)
values ('20000000-0000-0000-0000-000000000001', 'CR', 'Central Railway Division', 'Central Railway Node')
on conflict (code) do update set name = excluded.name;

-- Central Stations
insert into railway_central.stations (id, station_code, name, region_id, zone, state, latitude, longitude, geom, status)
values
  ('20000000-0000-0000-0001-000000000001', 'CSMT', 'Mumbai CSMT', '20000000-0000-0000-0000-000000000001', 'Central Railway', 'Maharashtra', 18.9398, 72.8355, extensions.ST_SetSRID(extensions.ST_MakePoint(72.8355, 18.9398), 4326)::extensions.geography, 'ACTIVE'),
  ('20000000-0000-0000-0001-000000000002', 'DR', 'Dadar Central', '20000000-0000-0000-0000-000000000001', 'Central Railway', 'Maharashtra', 19.0178, 72.8478, extensions.ST_SetSRID(extensions.ST_MakePoint(72.8478, 19.0178), 4326)::extensions.geography, 'ACTIVE'),
  ('20000000-0000-0000-0001-000000000003', 'KYN', 'Kalyan Junction', '20000000-0000-0000-0000-000000000001', 'Central Railway', 'Maharashtra', 19.2354, 73.1299, extensions.ST_SetSRID(extensions.ST_MakePoint(73.1299, 19.2354), 4326)::extensions.geography, 'ACTIVE'),
  ('20000000-0000-0000-0001-000000000004', 'BSL', 'Bhusaval Junction', '20000000-0000-0000-0000-000000000001', 'Central Railway', 'Maharashtra', 21.0454, 75.7891, extensions.ST_SetSRID(extensions.ST_MakePoint(75.7891, 21.0454), 4326)::extensions.geography, 'ACTIVE'),
  ('20000000-0000-0000-0001-000000000005', 'NGP', 'Nagpur Junction', '20000000-0000-0000-0000-000000000001', 'Central Railway', 'Maharashtra', 21.1524, 79.0888, extensions.ST_SetSRID(extensions.ST_MakePoint(79.0888, 21.1524), 4326)::extensions.geography, 'ACTIVE'),
  ('20000000-0000-0000-0001-000000000006', 'ET', 'Itarsi Junction', '20000000-0000-0000-0000-000000000001', 'West Central Link', 'Madhya Pradesh', 22.6120, 77.7656, extensions.ST_SetSRID(extensions.ST_MakePoint(77.7656, 22.6120), 4326)::extensions.geography, 'ACTIVE'),
  ('20000000-0000-0000-0001-000000000007', 'BPL', 'Bhopal Junction', '20000000-0000-0000-0000-000000000001', 'West Central Link', 'Madhya Pradesh', 23.2599, 77.4126, extensions.ST_SetSRID(extensions.ST_MakePoint(77.4126, 23.2599), 4326)::extensions.geography, 'ACTIVE'),
  ('20000000-0000-0000-0001-000000000008', 'BINA', 'Bina Junction', '20000000-0000-0000-0000-000000000001', 'West Central Link', 'Madhya Pradesh', 24.2155, 78.1812, extensions.ST_SetSRID(extensions.ST_MakePoint(78.1812, 24.2155), 4326)::extensions.geography, 'ACTIVE')
on conflict (station_code) do update set name = excluded.name, status = excluded.status;

-- Central Tracks
insert into railway_central.tracks (id, from_station_id, to_station_id, region_id, distance_km, track_type, speed_limit_kmph, status, geom)
values
  ('20000000-0000-0000-0002-000000000001', '20000000-0000-0000-0001-000000000001', '20000000-0000-0000-0001-000000000002', '20000000-0000-0000-0000-000000000001', 9.00, 'QUAD_ELECTRIFIED', 90, 'ACTIVE', extensions.ST_MakeLine(extensions.ST_MakePoint(72.8355, 18.9398), extensions.ST_MakePoint(72.8478, 19.0178))::extensions.geography),
  ('20000000-0000-0000-0002-000000000002', '20000000-0000-0000-0001-000000000002', '20000000-0000-0000-0001-000000000003', '20000000-0000-0000-0000-000000000001', 44.00, 'QUAD_ELECTRIFIED', 100, 'ACTIVE', extensions.ST_MakeLine(extensions.ST_MakePoint(72.8478, 19.0178), extensions.ST_MakePoint(73.1299, 19.2354))::extensions.geography),
  ('20000000-0000-0000-0002-000000000003', '20000000-0000-0000-0001-000000000003', '20000000-0000-0000-0001-000000000004', '20000000-0000-0000-0000-000000000001', 381.00, 'DOUBLE_ELECTRIFIED', 110, 'ACTIVE', extensions.ST_MakeLine(extensions.ST_MakePoint(73.1299, 19.2354), extensions.ST_MakePoint(75.7891, 21.0454))::extensions.geography),
  ('20000000-0000-0000-0002-000000000004', '20000000-0000-0000-0001-000000000004', '20000000-0000-0000-0001-000000000006', '20000000-0000-0000-0000-000000000001', 307.00, 'DOUBLE_ELECTRIFIED', 110, 'ACTIVE', extensions.ST_MakeLine(extensions.ST_MakePoint(75.7891, 21.0454), extensions.ST_MakePoint(77.7656, 22.6120))::extensions.geography),
  ('20000000-0000-0000-0002-000000000005', '20000000-0000-0000-0001-000000000001', '20000000-0000-0000-0001-000000000005', '20000000-0000-0000-0000-000000000001', 837.00, 'DOUBLE_ELECTRIFIED', 120, 'ACTIVE', extensions.ST_MakeLine(extensions.ST_MakePoint(72.8355, 18.9398), extensions.ST_MakePoint(79.0888, 21.1524))::extensions.geography),
  ('20000000-0000-0000-0002-000000000006', '20000000-0000-0000-0001-000000000005', '20000000-0000-0000-0001-000000000006', '20000000-0000-0000-0000-000000000001', 298.00, 'DOUBLE_ELECTRIFIED', 110, 'ACTIVE', extensions.ST_MakeLine(extensions.ST_MakePoint(79.0888, 21.1524), extensions.ST_MakePoint(77.7656, 22.6120))::extensions.geography),
  ('20000000-0000-0000-0002-000000000007', '20000000-0000-0000-0001-000000000006', '20000000-0000-0000-0001-000000000007', '20000000-0000-0000-0000-000000000001', 92.00, 'DOUBLE_ELECTRIFIED', 130, 'ACTIVE', extensions.ST_MakeLine(extensions.ST_MakePoint(77.7656, 22.6120), extensions.ST_MakePoint(77.4126, 23.2599))::extensions.geography),
  ('20000000-0000-0000-0002-000000000008', '20000000-0000-0000-0001-000000000007', '20000000-0000-0000-0001-000000000008', '20000000-0000-0000-0000-000000000001', 139.00, 'DOUBLE_ELECTRIFIED', 120, 'ACTIVE', extensions.ST_MakeLine(extensions.ST_MakePoint(77.4126, 23.2599), extensions.ST_MakePoint(78.1812, 24.2155))::extensions.geography)
on conflict (from_station_id, to_station_id) do update set status = excluded.status;

-- Central Regional Trains
insert into railway_central.trains (id, train_number, name, train_type, priority, source_station_id, destination_station_id, status)
values
  ('20000000-0000-0000-0003-000000000001', '12951', 'Mumbai Rajdhani Express', 'SUPERFAST', 1, '20000000-0000-0000-0001-000000000001', '20000000-0000-0000-0001-000000000007', 'RUNNING'),
  ('20000000-0000-0000-0003-000000000002', '12137', 'Punjab Mail Express', 'EXPRESS', 2, '20000000-0000-0000-0001-000000000001', '20000000-0000-0000-0001-000000000007', 'RUNNING'),
  ('20000000-0000-0000-0003-000000000003', '12656', 'Navjeevan Express', 'SUPERFAST', 1, '20000000-0000-0000-0001-000000000001', '20000000-0000-0000-0001-000000000005', 'RUNNING')
on conflict (train_number) do update set name = excluded.name, status = excluded.status;


-- ========================================================
-- 2. NORTHERN RAILWAY NODE (railway_north)
-- ========================================================

-- Northern Region
insert into railway_north.regions (id, code, name, description)
values ('30000000-0000-0000-0000-000000000001', 'NR', 'Northern Railway Division', 'Northern Railway Node')
on conflict (code) do update set name = excluded.name;

-- Northern Stations
insert into railway_north.stations (id, station_code, name, region_id, zone, state, latitude, longitude, geom, status)
values
  ('30000000-0000-0000-0001-000000000001', 'NDLS', 'New Delhi', '30000000-0000-0000-0000-000000000001', 'Northern Railway', 'Delhi', 28.6448, 77.2188, extensions.ST_SetSRID(extensions.ST_MakePoint(77.2188, 28.6448), 4326)::extensions.geography, 'ACTIVE'),
  ('30000000-0000-0000-0001-000000000002', 'NZM', 'Hazrat Nizamuddin', '30000000-0000-0000-0000-000000000001', 'Northern Railway', 'Delhi', 28.5892, 77.2530, extensions.ST_SetSRID(extensions.ST_MakePoint(77.2530, 28.5892), 4326)::extensions.geography, 'ACTIVE'),
  ('30000000-0000-0000-0001-000000000003', 'MTJ', 'Mathura Junction', '30000000-0000-0000-0000-000000000001', 'North Central Link', 'Uttar Pradesh', 27.4924, 77.6737, extensions.ST_SetSRID(extensions.ST_MakePoint(77.6737, 27.4924), 4326)::extensions.geography, 'ACTIVE'),
  ('30000000-0000-0000-0001-000000000004', 'AGC', 'Agra Cantt', '30000000-0000-0000-0000-000000000001', 'North Central Link', 'Uttar Pradesh', 27.1577, 78.0069, extensions.ST_SetSRID(extensions.ST_MakePoint(78.0069, 27.1577), 4326)::extensions.geography, 'ACTIVE'),
  ('30000000-0000-0000-0001-000000000005', 'GWL', 'Gwalior Junction', '30000000-0000-0000-0000-000000000001', 'North Central Link', 'Madhya Pradesh', 26.2183, 78.1828, extensions.ST_SetSRID(extensions.ST_MakePoint(78.1828, 26.2183), 4326)::extensions.geography, 'ACTIVE'),
  ('30000000-0000-0000-0001-000000000006', 'VGLJ', 'Virangana Lakshmibai Jhansi', '30000000-0000-0000-0000-000000000001', 'North Central Link', 'Uttar Pradesh', 25.4484, 78.5685, extensions.ST_SetSRID(extensions.ST_MakePoint(78.5685, 25.4484), 4326)::extensions.geography, 'ACTIVE'),
  ('30000000-0000-0000-0001-000000000007', 'CNB', 'Kanpur Central', '30000000-0000-0000-0000-000000000001', 'North Central Link', 'Uttar Pradesh', 26.4542, 80.3501, extensions.ST_SetSRID(extensions.ST_MakePoint(80.3501, 26.4542), 4326)::extensions.geography, 'ACTIVE'),
  ('30000000-0000-0000-0001-000000000008', 'LKO', 'Lucknow Charbagh', '30000000-0000-0000-0000-000000000001', 'Northern Railway', 'Uttar Pradesh', 26.8315, 80.9238, extensions.ST_SetSRID(extensions.ST_MakePoint(80.9238, 26.8315), 4326)::extensions.geography, 'ACTIVE'),
  ('30000000-0000-0000-0001-000000000009', 'PRYJ', 'Prayagraj Junction', '30000000-0000-0000-0000-000000000001', 'North Central Link', 'Uttar Pradesh', 25.4448, 81.8286, extensions.ST_SetSRID(extensions.ST_MakePoint(81.8286, 25.4448), 4326)::extensions.geography, 'ACTIVE')
on conflict (station_code) do update set name = excluded.name, status = excluded.status;

-- Northern Tracks
insert into railway_north.tracks (id, from_station_id, to_station_id, region_id, distance_km, track_type, speed_limit_kmph, status, geom)
values
  ('30000000-0000-0000-0002-000000000001', '30000000-0000-0000-0001-000000000001', '30000000-0000-0000-0001-000000000002', '30000000-0000-0000-0000-000000000001', 7.00, 'QUAD_ELECTRIFIED', 90, 'ACTIVE', extensions.ST_MakeLine(extensions.ST_MakePoint(77.2188, 28.6448), extensions.ST_MakePoint(77.2530, 28.5892))::extensions.geography),
  ('30000000-0000-0000-0002-000000000002', '30000000-0000-0000-0001-000000000002', '30000000-0000-0000-0001-000000000003', '30000000-0000-0000-0000-000000000001', 134.00, 'DOUBLE_ELECTRIFIED', 130, 'ACTIVE', extensions.ST_MakeLine(extensions.ST_MakePoint(77.2530, 28.5892), extensions.ST_MakePoint(77.6737, 27.4924))::extensions.geography),
  ('30000000-0000-0000-0002-000000000003', '30000000-0000-0000-0001-000000000003', '30000000-0000-0000-0001-000000000004', '30000000-0000-0000-0000-000000000001', 54.00, 'DOUBLE_ELECTRIFIED', 130, 'ACTIVE', extensions.ST_MakeLine(extensions.ST_MakePoint(77.6737, 27.4924), extensions.ST_MakePoint(78.0069, 27.1577))::extensions.geography),
  ('30000000-0000-0000-0002-000000000004', '30000000-0000-0000-0001-000000000004', '30000000-0000-0000-0001-000000000005', '30000000-0000-0000-0000-000000000001', 118.00, 'DOUBLE_ELECTRIFIED', 130, 'ACTIVE', extensions.ST_MakeLine(extensions.ST_MakePoint(78.0069, 27.1577), extensions.ST_MakePoint(78.1828, 26.2183))::extensions.geography),
  ('30000000-0000-0000-0002-000000000005', '30000000-0000-0000-0001-000000000005', '30000000-0000-0000-0001-000000000006', '30000000-0000-0000-0000-000000000001', 97.00, 'DOUBLE_ELECTRIFIED', 130, 'ACTIVE', extensions.ST_MakeLine(extensions.ST_MakePoint(78.1828, 26.2183), extensions.ST_MakePoint(78.5685, 25.4484))::extensions.geography),
  ('30000000-0000-0000-0002-000000000006', '30000000-0000-0000-0001-000000000001', '30000000-0000-0000-0001-000000000007', '30000000-0000-0000-0000-000000000001', 440.00, 'DOUBLE_ELECTRIFIED', 130, 'ACTIVE', extensions.ST_MakeLine(extensions.ST_MakePoint(77.2188, 28.6448), extensions.ST_MakePoint(80.3501, 26.4542))::extensions.geography),
  ('30000000-0000-0000-0002-000000000007', '30000000-0000-0000-0001-000000000007', '30000000-0000-0000-0001-000000000008', '30000000-0000-0000-0000-000000000001', 72.00, 'DOUBLE_ELECTRIFIED', 110, 'ACTIVE', extensions.ST_MakeLine(extensions.ST_MakePoint(80.3501, 26.4542), extensions.ST_MakePoint(80.9238, 26.8315))::extensions.geography),
  ('30000000-0000-0000-0002-000000000008', '30000000-0000-0000-0001-000000000007', '30000000-0000-0000-0001-000000000009', '30000000-0000-0000-0000-000000000001', 194.00, 'DOUBLE_ELECTRIFIED', 130, 'ACTIVE', extensions.ST_MakeLine(extensions.ST_MakePoint(80.3501, 26.4542), extensions.ST_MakePoint(81.8286, 25.4448))::extensions.geography)
on conflict (from_station_id, to_station_id) do update set status = excluded.status;

-- Cross-region physical tracks used by multi-database trains.
insert into railway_central.tracks (id, from_station_id, to_station_id, region_id, distance_km, track_type, speed_limit_kmph, status, geom)
select
  '40000000-0000-0000-0002-000000000001'::uuid,
  ru.id,
  ngp.id,
  cr.id,
  718.00,
  'DOUBLE_ELECTRIFIED',
  120,
  'ACTIVE'::public.track_status,
  extensions.ST_MakeLine(
    extensions.ST_MakePoint(ru.longitude, ru.latitude),
    extensions.ST_MakePoint(ngp.longitude, ngp.latitude)
  )::extensions.geography
from railway_south.stations ru
cross join railway_central.stations ngp
cross join railway_central.regions cr
where ru.station_code = 'RU'
  and ngp.station_code = 'NGP'
  and cr.code = 'CR'
on conflict (from_station_id, to_station_id) do update
set distance_km = excluded.distance_km,
    track_type = excluded.track_type,
    speed_limit_kmph = excluded.speed_limit_kmph,
    status = excluded.status,
    geom = excluded.geom;

insert into railway_north.tracks (id, from_station_id, to_station_id, region_id, distance_km, track_type, speed_limit_kmph, status, geom)
select
  '40000000-0000-0000-0002-000000000002'::uuid,
  bina.id,
  vglj.id,
  nr.id,
  168.00,
  'DOUBLE_ELECTRIFIED',
  120,
  'ACTIVE'::public.track_status,
  extensions.ST_MakeLine(
    extensions.ST_MakePoint(bina.longitude, bina.latitude),
    extensions.ST_MakePoint(vglj.longitude, vglj.latitude)
  )::extensions.geography
from railway_central.stations bina
cross join railway_north.stations vglj
cross join railway_north.regions nr
where bina.station_code = 'BINA'
  and vglj.station_code = 'VGLJ'
  and nr.code = 'NR'
on conflict (from_station_id, to_station_id) do update
set distance_km = excluded.distance_km,
    track_type = excluded.track_type,
    speed_limit_kmph = excluded.speed_limit_kmph,
    status = excluded.status,
    geom = excluded.geom;

-- Northern Regional Trains
insert into railway_north.trains (id, train_number, name, train_type, priority, source_station_id, destination_station_id, status)
values
  ('30000000-0000-0000-0003-000000000001', '12002', 'Bhopal Shatabdi Express', 'SUPERFAST', 1, '30000000-0000-0000-0001-000000000001', '30000000-0000-0000-0001-000000000006', 'RUNNING'),
  ('30000000-0000-0000-0003-000000000002', '12424', 'New Delhi Tejas Express', 'SUPERFAST', 1, '30000000-0000-0000-0001-000000000001', '30000000-0000-0000-0001-000000000008', 'RUNNING')
on conflict (train_number) do update set name = excluded.name, status = excluded.status;


-- ========================================================
-- 3. CROSS-REGION MULTI-DB TRAINS & SCHEDULES
-- (Passing through South, Central, and North Database Nodes)
-- ========================================================

-- A. Register Cross-Region Master Train Definitions in South Node
insert into railway_south.trains (id, train_number, name, train_type, priority, source_station_id, destination_station_id, status)
values
  (
    '40000000-0000-0000-0001-000000000001', '12615', 'Grand Trunk (GT) Express', 'SUPERFAST', 1,
    (select id from railway_south.stations where station_code = 'MAS'),
    (select id from railway_north.stations where station_code = 'NDLS'),
    'RUNNING'
  ),
  (
    '40000000-0000-0000-0001-000000000002', '12621', 'Tamil Nadu Express', 'SUPERFAST', 1,
    (select id from railway_south.stations where station_code = 'MAS'),
    (select id from railway_south.stations where station_code = 'SBC'),
    'RUNNING'
  ),
  (
    '40000000-0000-0000-0001-000000000003', '12269', 'Chennai-Hizamuddin Duronto', 'SUPERFAST', 1,
    (select id from railway_south.stations where station_code = 'MAS'),
    (select id from railway_south.stations where station_code = 'SBC'),
    'RUNNING'
)
on conflict (train_number) do update
set name = excluded.name,
    source_station_id = excluded.source_station_id,
    destination_station_id = excluded.destination_station_id,
    status = excluded.status;


-- B. Schedules across SOUTH NODE (railway_south.train_schedules)
insert into railway_south.train_schedules (train_id, station_id, stop_sequence, scheduled_arrival, scheduled_departure, day_offset, platform)
select
  '40000000-0000-0000-0001-000000000001',
  s.id,
  sd.stop_seq,
  sd.arr::time,
  sd.dep::time,
  sd.day_off,
  sd.plat
from (values
  ('MAS', 1, null, '19:15', 0, '5'),
  ('AJJ', 2, '20:13', '20:15', 0, '2'),
  ('RU', 3, '21:40', '21:45', 0, '1')
) as sd(st_code, stop_seq, arr, dep, day_off, plat)
join railway_south.stations s on s.station_code = sd.st_code
on conflict (train_id, stop_sequence) do update set platform = excluded.platform;

insert into railway_south.train_schedules (train_id, station_id, stop_sequence, scheduled_arrival, scheduled_departure, day_offset, platform)
select
  '40000000-0000-0000-0001-000000000002',
  s.id,
  sd.stop_seq,
  sd.arr::time,
  sd.dep::time,
  sd.day_off,
  sd.plat
from (values
  ('MAS', 1, null, '22:00', 0, '6')
) as sd(st_code, stop_seq, arr, dep, day_off, plat)
join railway_south.stations s on s.station_code = sd.st_code
on conflict (train_id, stop_sequence) do update set platform = excluded.platform;


-- C. Schedules across CENTRAL NODE (railway_central.train_schedules)
insert into railway_central.train_schedules (train_id, station_id, stop_sequence, scheduled_arrival, scheduled_departure, day_offset, platform)
select
  '40000000-0000-0000-0001-000000000001',
  s.id,
  sd.stop_seq,
  sd.arr::time,
  sd.dep::time,
  sd.day_off,
  sd.plat
from (values
  ('NGP', 4, '05:30', '05:35', 1, '2'),
  ('ET', 5, '09:40', '09:45', 1, '1'),
  ('BPL', 6, '11:20', '11:25', 1, '1'),
  ('BINA', 7, '13:10', '13:12', 1, '3')
) as sd(st_code, stop_seq, arr, dep, day_off, plat)
join railway_central.stations s on s.station_code = sd.st_code
on conflict (train_id, stop_sequence) do update set platform = excluded.platform;

insert into railway_central.train_schedules (train_id, station_id, stop_sequence, scheduled_arrival, scheduled_departure, day_offset, platform)
select
  (select id from railway_central.trains where train_number = '12656'),
  s.id,
  sd.stop_seq,
  sd.arr::time,
  sd.dep::time,
  sd.day_off,
  sd.plat
from (values
  ('NGP', 1, null, '06:00', 0, '1'),
  ('BSL', 2, '11:45', '11:50', 0, '2'),
  ('KYN', 3, '17:20', '17:23', 0, '5'),
  ('DR', 4, '18:10', '18:12', 0, '6'),
  ('CSMT', 5, '18:35', null, 0, '15')
) as sd(st_code, stop_seq, arr, dep, day_off, plat)
join railway_central.stations s on s.station_code = sd.st_code
on conflict (train_id, stop_sequence) do update set platform = excluded.platform;


-- D. Schedules across NORTHERN NODE (railway_north.train_schedules)
insert into railway_north.train_schedules (train_id, station_id, stop_sequence, scheduled_arrival, scheduled_departure, day_offset, platform)
select
  '40000000-0000-0000-0001-000000000001',
  s.id,
  sd.stop_seq,
  sd.arr::time,
  sd.dep::time,
  sd.day_off,
  sd.plat
from (values
  ('VGLJ', 8, '15:15', '15:20', 1, '2'),
  ('GWL', 9, '16:30', '16:32', 1, '1'),
  ('AGC', 10, '18:15', '18:20', 1, '1'),
  ('MTJ', 11, '19:10', '19:12', 1, '2'),
  ('NDLS', 12, '21:30', null, 1, '4')
) as sd(st_code, stop_seq, arr, dep, day_off, plat)
join railway_north.stations s on s.station_code = sd.st_code
on conflict (train_id, stop_sequence) do update set platform = excluded.platform;

insert into railway_north.train_schedules (train_id, station_id, stop_sequence, scheduled_arrival, scheduled_departure, day_offset, platform)
select
  (select id from railway_north.trains where train_number = '12424'),
  s.id,
  sd.stop_seq,
  sd.arr::time,
  sd.dep::time,
  sd.day_off,
  sd.plat
from (values
  ('NDLS', 1, null, '16:10', 0, '16'),
  ('CNB', 2, '21:30', '21:35', 0, '1'),
  ('LKO', 3, '23:05', null, 0, '2')
) as sd(st_code, stop_seq, arr, dep, day_off, plat)
join railway_north.stations s on s.station_code = sd.st_code
on conflict (train_id, stop_sequence) do update set platform = excluded.platform;

commit;
