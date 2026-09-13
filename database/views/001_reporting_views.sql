-- Phase 6 views: SQL-first reporting and dashboard read models.

create or replace view railway_main.v_track_network as
select
  tr.id as track_id,
  tr.status,
  tr.distance_km,
  tr.track_type,
  tr.speed_limit_kmph,
  tr.valid_from,
  tr.valid_to,
  r.code as region_code,
  r.name as region_name,
  fs.id as from_station_id,
  fs.station_code as from_station_code,
  fs.name as from_station_name,
  ts.id as to_station_id,
  ts.station_code as to_station_code,
  ts.name as to_station_name,
  tr.geom
from railway_main.tracks tr
join railway_main.regions r on r.id = tr.region_id
join railway_main.stations fs on fs.id = tr.from_station_id
join railway_main.stations ts on ts.id = tr.to_station_id;

create or replace view railway_main.v_train_schedule_ordered as
select
  sch.id as schedule_id,
  t.id as train_id,
  t.train_number,
  t.name as train_name,
  sch.stop_sequence,
  s.id as station_id,
  s.station_code,
  s.name as station_name,
  sch.scheduled_arrival,
  sch.scheduled_departure,
  sch.day_offset,
  sch.platform
from railway_main.train_schedules sch
join railway_main.trains t on t.id = sch.train_id
join railway_main.stations s on s.id = sch.station_id
order by t.train_number, sch.stop_sequence;

create or replace view railway_main.v_active_train_journeys as
select
  tj.id as train_journey_id,
  tj.journey_date,
  tj.journey_status,
  tj.delay_minutes,
  t.id as train_id,
  t.train_number,
  t.name as train_name,
  t.train_type,
  t.priority,
  cs.id as current_station_id,
  cs.station_code as current_station_code,
  cs.name as current_station_name,
  ns.id as next_station_id,
  ns.station_code as next_station_code,
  ns.name as next_station_name,
  tj.actual_arrival,
  tj.actual_departure
from railway_main.train_journeys tj
join railway_main.trains t on t.id = tj.train_id
left join railway_main.stations cs on cs.id = tj.current_station_id
left join railway_main.stations ns on ns.id = tj.next_station_id
where tj.journey_status in ('RUNNING', 'DELAYED', 'REROUTED');

create or replace view railway_main.v_active_disruptions as
select
  d.id as disruption_id,
  d.type,
  d.severity,
  d.status,
  d.reported_by,
  d.description,
  d.started_at,
  d.ended_at,
  tr.id as track_id,
  fs.station_code as from_station_code,
  fs.name as from_station_name,
  ts.station_code as to_station_code,
  ts.name as to_station_name,
  s.id as station_id,
  s.station_code,
  s.name as station_name,
  d.geom
from railway_main.disruptions d
left join railway_main.tracks tr on tr.id = d.track_id
left join railway_main.stations fs on fs.id = tr.from_station_id
left join railway_main.stations ts on ts.id = tr.to_station_id
left join railway_main.stations s on s.id = d.station_id
where d.status in ('OPEN', 'ANALYZING');

create or replace view railway_main.v_disruption_impact_summary as
select
  d.id as disruption_id,
  d.type,
  d.severity,
  d.status,
  d.started_at,
  count(distinct at.id)::integer as affected_train_count,
  coalesce(sum(at.estimated_delay_minutes), 0)::integer as total_estimated_delay_minutes,
  count(distinct rr.id)::integer as recommendation_count,
  count(distinct rr.id) filter (where rr.status = 'PROPOSED')::integer as proposed_recommendation_count,
  count(distinct rr.id) filter (where rr.status = 'APPLIED')::integer as applied_recommendation_count
from railway_main.disruptions d
left join railway_main.affected_trains at on at.disruption_id = d.id
left join railway_main.route_recommendations rr on rr.disruption_id = d.id
group by d.id, d.type, d.severity, d.status, d.started_at;

