-- Phase 15 logical distribution inside one managed PostgreSQL database.
create or replace view railway_south.stations as
select s.* from railway_main.stations s join railway_main.regions r on r.id=s.region_id where r.code='SR';
create or replace view railway_central.stations as
select s.* from railway_main.stations s join railway_main.regions r on r.id=s.region_id where r.code='CR';
create or replace view railway_north.stations as
select s.* from railway_main.stations s join railway_main.regions r on r.id=s.region_id where r.code='NR';
create or replace view railway_south.tracks as
select t.* from railway_main.tracks t join railway_main.regions r on r.id=t.region_id where r.code='SR';
create or replace view railway_central.tracks as
select t.* from railway_main.tracks t join railway_main.regions r on r.id=t.region_id where r.code='CR';
create or replace view railway_north.tracks as
select t.* from railway_main.tracks t join railway_main.regions r on r.id=t.region_id where r.code='NR';

create or replace view railway_main.v_distributed_stations as
select 'railway_south'::text storage_region,s.* from railway_south.stations s
union all select 'railway_central',s.* from railway_central.stations s
union all select 'railway_north',s.* from railway_north.stations s;
create or replace view railway_main.v_distributed_tracks as
select 'railway_south'::text storage_region,t.* from railway_south.tracks t
union all select 'railway_central',t.* from railway_central.tracks t
union all select 'railway_north',t.* from railway_north.tracks t;
create or replace view railway_main.v_cross_region_journeys as
select j.id train_journey_id,t.train_number,t.name,count(distinct s.region_id)::integer region_count,
  array_agg(distinct r.code order by r.code) region_codes
from railway_main.train_journeys j join railway_main.trains t on t.id=j.train_id
join railway_main.train_schedules sch on sch.train_id=t.id join railway_main.stations s on s.id=sch.station_id
join railway_main.regions r on r.id=s.region_id group by j.id,t.train_number,t.name
having count(distinct s.region_id)>1;

revoke all on schema railway_south,railway_central,railway_north from public;
grant usage on schema railway_south,railway_central,railway_north to railway_app;
grant select on all tables in schema railway_south,railway_central,railway_north to railway_app;
grant select on railway_main.v_distributed_stations,railway_main.v_distributed_tracks,
  railway_main.v_cross_region_journeys to railway_app;
