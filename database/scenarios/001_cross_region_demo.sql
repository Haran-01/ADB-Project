insert into railway_south.regions(code,name,description) values
  ('CR','Central Railway Demo Region','Logical central regional projection.'),
  ('NR','Northern Railway Demo Region','Logical northern regional projection.')
on conflict(code) do update set name=excluded.name,description=excluded.description;

insert into railway_central.regions(code,name,description) values
  ('CR','Central Railway Demo Region','Logical central regional projection.'),
  ('NR','Northern Railway Demo Region','Logical northern regional projection.')
on conflict(code) do update set name=excluded.name,description=excluded.description;

insert into railway_north.regions(code,name,description) values
  ('CR','Central Railway Demo Region','Logical central regional projection.'),
  ('NR','Northern Railway Demo Region','Logical northern regional projection.')
on conflict(code) do update set name=excluded.name,description=excluded.description;

-- Insert Central & Northern Stations directly into regional physical node tables
insert into railway_central.stations(id,station_code,name,region_id,zone,state,latitude,longitude,geom)
select extensions.gen_random_uuid(),'BPL','Bhopal Junction',r.id,'Cross-region demo','Madhya Pradesh',23.2679,77.4126,
  extensions.ST_SetSRID(extensions.ST_MakePoint(77.4126,23.2679),4326)::extensions.geography
from public.regions r where r.code='CR'
on conflict(station_code) do update set name=excluded.name,state=excluded.state;

insert into railway_north.stations(id,station_code,name,region_id,zone,state,latitude,longitude,geom)
select extensions.gen_random_uuid(),'NDLS','New Delhi',r.id,'Cross-region demo','Delhi',28.6424,77.2195,
  extensions.ST_SetSRID(extensions.ST_MakePoint(77.2195,28.6424),4326)::extensions.geography
from public.regions r where r.code='NR'
on conflict(station_code) do update set name=excluded.name,state=excluded.state;

-- Insert Central & Northern Tracks directly into regional physical node tables
insert into railway_central.tracks(from_station_id,to_station_id,region_id,distance_km,track_type,speed_limit_kmph,geom,valid_from)
select a.id,b.id,r.id,1440.00,'CROSS_REGION_ELECTRIFIED',110,
  extensions.ST_MakeLine(a.geom::extensions.geometry,b.geom::extensions.geometry)::extensions.geography,now()-interval '30 days'
from public.stations a, public.stations b, public.regions r
where a.station_code='SBC' and b.station_code='BPL' and r.code='CR'
on conflict(from_station_id,to_station_id) do update set distance_km=excluded.distance_km;

insert into railway_central.tracks(from_station_id,to_station_id,region_id,distance_km,track_type,speed_limit_kmph,geom,valid_from)
select a.id,b.id,r.id,702.00,'CROSS_REGION_ELECTRIFIED',110,
  extensions.ST_MakeLine(a.geom::extensions.geometry,b.geom::extensions.geometry)::extensions.geography,now()-interval '30 days'
from public.stations a, public.stations b, public.regions r
where a.station_code='BPL' and b.station_code='NDLS' and r.code='CR'
on conflict(from_station_id,to_station_id) do update set distance_km=excluded.distance_km;

insert into railway_north.tracks(from_station_id,to_station_id,region_id,distance_km,track_type,speed_limit_kmph,geom,valid_from)
select a.id,b.id,r.id,702.00,'CROSS_REGION_ELECTRIFIED',110,
  extensions.ST_MakeLine(a.geom::extensions.geometry,b.geom::extensions.geometry)::extensions.geography,now()-interval '30 days'
from public.stations a, public.stations b, public.regions r
where a.station_code='NDLS' and b.station_code='BPL' and r.code='NR'
on conflict(from_station_id,to_station_id) do update set distance_km=excluded.distance_km;

-- Insert Cross-Region Train into home regional node table (railway_south)
insert into railway_south.trains(train_number,name,train_type,priority,source_station_id,destination_station_id,status)
select '12951','Southern–Northern Cross-Region Demo','SUPERFAST',1,a.id,b.id,'RUNNING'
from public.stations a, public.stations b where a.station_code='SBC' and b.station_code='NDLS'
on conflict(train_number) do update set name=excluded.name;

-- Insert Schedules into respective regional node tables
insert into railway_south.train_schedules(train_id,station_id,stop_sequence,scheduled_arrival,scheduled_departure,day_offset)
select t.id,s.id,1,null::time,'20:00'::time,0
from public.stations s, public.trains t
where s.station_code='SBC' and t.train_number='12951'
on conflict(train_id,stop_sequence) do update set scheduled_departure=excluded.scheduled_departure;

insert into railway_central.train_schedules(train_id,station_id,stop_sequence,scheduled_arrival,scheduled_departure,day_offset)
select t.id,s.id,2,'07:00'::time,'07:10'::time,1
from public.stations s, public.trains t
where s.station_code='BPL' and t.train_number='12951'
on conflict(train_id,stop_sequence) do update set scheduled_arrival=excluded.scheduled_arrival;

insert into railway_north.train_schedules(train_id,station_id,stop_sequence,scheduled_arrival,scheduled_departure,day_offset)
select t.id,s.id,3,'15:00'::time,null::time,1
from public.stations s, public.trains t
where s.station_code='NDLS' and t.train_number='12951'
on conflict(train_id,stop_sequence) do update set scheduled_arrival=excluded.scheduled_arrival;

-- Disruption & Journey Tracking
insert into railway_south.train_journeys(train_id,journey_date,current_station_id,next_station_id,delay_minutes,journey_status)
select t.id,current_date,s.id,n.id,18,'DELAYED' from public.trains t
join public.stations s on s.station_code='BPL' join public.stations n on n.station_code='NDLS'
where t.train_number='12951' on conflict(train_id,journey_date) do update set current_station_id=excluded.current_station_id,
  next_station_id=excluded.next_station_id,delay_minutes=excluded.delay_minutes,journey_status=excluded.journey_status;

insert into railway_central.disruptions(type,track_id,severity,reported_by,description,status,geom)
select 'MAINTENANCE',t.id,'MEDIUM','phase-15-demo','Cross-region maintenance affecting the Bhopal–Delhi service.','OPEN',
  extensions.ST_LineInterpolatePoint(t.geom::extensions.geometry,0.5)::extensions.geography
from public.tracks t join public.stations a on a.id=t.from_station_id join public.stations b on b.id=t.to_station_id
where a.station_code='BPL' and b.station_code='NDLS'
and not exists(select 1 from public.disruptions d where d.track_id=t.id and d.status in ('OPEN','ANALYZING'));
