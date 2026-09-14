insert into railway_main.regions(code,name,description) values
  ('CR','Central Railway Demo Region','Logical central regional projection.'),
  ('NR','Northern Railway Demo Region','Logical northern regional projection.')
on conflict(code) do update set name=excluded.name,description=excluded.description;

with rows(code,name,region,state,lat,lng) as (values
  ('BPL','Bhopal Junction','CR','Madhya Pradesh',23.2679,77.4126),
  ('NDLS','New Delhi','NR','Delhi',28.6424,77.2195)
)
insert into railway_main.stations(station_code,name,region_id,zone,state,latitude,longitude,geom)
select x.code,x.name,r.id,'Cross-region demo',x.state,x.lat,x.lng,
  extensions.ST_SetSRID(extensions.ST_MakePoint(x.lng,x.lat),4326)::extensions.geography
from rows x join railway_main.regions r on r.code=x.region
on conflict(station_code) do update set name=excluded.name,region_id=excluded.region_id,state=excluded.state,
  latitude=excluded.latitude,longitude=excluded.longitude,geom=excluded.geom;

with rows(from_code,to_code,region,distance,speed) as (values
  ('SBC','BPL','CR',1440.00,110),('BPL','SBC','CR',1440.00,110),
  ('BPL','NDLS','CR',702.00,110),('NDLS','BPL','NR',702.00,110)
)
insert into railway_main.tracks(from_station_id,to_station_id,region_id,distance_km,track_type,speed_limit_kmph,geom,valid_from)
select a.id,b.id,r.id,x.distance,'CROSS_REGION_ELECTRIFIED',x.speed,
  extensions.ST_MakeLine(a.geom::extensions.geometry,b.geom::extensions.geometry)::extensions.geography,now()-interval '30 days'
from rows x join railway_main.stations a on a.station_code=x.from_code
join railway_main.stations b on b.station_code=x.to_code join railway_main.regions r on r.code=x.region
on conflict(from_station_id,to_station_id) do update set region_id=excluded.region_id,distance_km=excluded.distance_km,
  speed_limit_kmph=excluded.speed_limit_kmph,geom=excluded.geom;

insert into railway_main.trains(train_number,name,train_type,priority,source_station_id,destination_station_id,status)
select '12951','Southern–Northern Cross-Region Demo','SUPERFAST',1,a.id,b.id,'RUNNING'
from railway_main.stations a,railway_main.stations b where a.station_code='SBC' and b.station_code='NDLS'
on conflict(train_number) do update set name=excluded.name,source_station_id=excluded.source_station_id,destination_station_id=excluded.destination_station_id;

with rows(seq,code,arrival,departure,day_number) as (values
  (1,'SBC',null::time,'16:00'::time,0),(2,'BPL','07:00'::time,'07:10'::time,1),(3,'NDLS','15:00'::time,null::time,1)
)
insert into railway_main.train_schedules(train_id,station_id,stop_sequence,scheduled_arrival,scheduled_departure,day_offset)
select t.id,s.id,x.seq,x.arrival,x.departure,x.day_number from rows x join railway_main.stations s on s.station_code=x.code
join railway_main.trains t on t.train_number='12951'
on conflict(train_id,stop_sequence) do update set station_id=excluded.station_id,scheduled_arrival=excluded.scheduled_arrival,
  scheduled_departure=excluded.scheduled_departure,day_offset=excluded.day_offset;

insert into railway_main.train_journeys(train_id,journey_date,current_station_id,next_station_id,delay_minutes,journey_status)
select t.id,current_date,s.id,n.id,18,'DELAYED' from railway_main.trains t
join railway_main.stations s on s.station_code='BPL' join railway_main.stations n on n.station_code='NDLS'
where t.train_number='12951' on conflict(train_id,journey_date) do update set current_station_id=excluded.current_station_id,
  next_station_id=excluded.next_station_id,delay_minutes=excluded.delay_minutes,journey_status=excluded.journey_status;

insert into railway_main.disruptions(type,track_id,severity,reported_by,description,status,geom)
select 'MAINTENANCE',t.id,'MEDIUM','phase-15-demo','Cross-region maintenance affecting the Bhopal–Delhi service.','OPEN',
  extensions.ST_LineInterpolatePoint(t.geom::extensions.geometry,0.5)::extensions.geography
from railway_main.tracks t join railway_main.stations a on a.id=t.from_station_id join railway_main.stations b on b.id=t.to_station_id
where a.station_code='BPL' and b.station_code='NDLS'
and not exists(select 1 from railway_main.disruptions d where d.track_id=t.id and d.status in ('OPEN','ANALYZING'));
