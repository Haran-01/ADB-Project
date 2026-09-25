-- Phase 6 views: SQL-first reporting and dashboard read models.

drop view if exists public.v_disruption_impact_summary cascade;
drop view if exists public.v_active_disruptions cascade;
drop view if exists public.v_active_train_journeys cascade;
drop view if exists public.v_train_schedule_ordered cascade;
drop view if exists public.v_track_network cascade;

create or replace view public.v_track_network as
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
from public.tracks tr
join public.regions r on r.id = tr.region_id
join public.stations fs on fs.id = tr.from_station_id
join public.stations ts on ts.id = tr.to_station_id;

create or replace view public.v_train_schedule_ordered as
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
from public.train_schedules sch
join public.trains t on t.id = sch.train_id
join public.stations s on s.id = sch.station_id
order by t.train_number, sch.stop_sequence;

create or replace view public.v_active_train_journeys as
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
from public.train_journeys tj
join public.trains t on t.id = tj.train_id
left join public.stations cs on cs.id = tj.current_station_id
left join public.stations ns on ns.id = tj.next_station_id
where tj.journey_status in ('RUNNING', 'DELAYED', 'REROUTED');

create or replace view public.v_active_disruptions as
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
from public.disruptions d
left join public.tracks tr on tr.id = d.track_id
left join public.stations fs on fs.id = tr.from_station_id
left join public.stations ts on ts.id = tr.to_station_id
left join public.stations s on s.id = d.station_id
where d.status in ('OPEN', 'ANALYZING');

create or replace view public.v_disruption_impact_summary as
select
  d.id as disruption_id,
  d.type,
  d.severity,
  d.status,
  d.started_at,
  coalesce(at.affected_train_count, 0)::integer as affected_train_count,
  coalesce(at.total_estimated_delay_minutes, 0)::integer as total_estimated_delay_minutes,
  coalesce(rr.recommendation_count, 0)::integer as recommendation_count,
  coalesce(rr.proposed_recommendation_count, 0)::integer as proposed_recommendation_count,
  coalesce(rr.applied_recommendation_count, 0)::integer as applied_recommendation_count
from public.disruptions d
left join (
  select disruption_id, count(*) as affected_train_count,
    sum(estimated_delay_minutes) as total_estimated_delay_minutes
  from public.affected_trains group by disruption_id
) at on at.disruption_id = d.id
left join (
  select disruption_id, count(*) as recommendation_count,
    count(*) filter (where status='PROPOSED') as proposed_recommendation_count,
    count(*) filter (where status='APPLIED') as applied_recommendation_count
  from public.route_recommendations group by disruption_id
) rr on rr.disruption_id = d.id;

create or replace view public.v_cross_region_journeys as
select
  tj.id as train_journey_id,
  t.train_number,
  t.name as train_name,
  tj.journey_date,
  tj.journey_status,
  tj.delay_minutes,
  array_agg(distinct r.code order by r.code) as region_codes
from public.train_journeys tj
join public.trains t on t.id = tj.train_id
join public.train_schedules ts on ts.train_id = t.id
join public.stations s on s.id = ts.station_id
join public.regions r on r.id = s.region_id
group by tj.id, t.train_number, t.name, tj.journey_date, tj.journey_status, tj.delay_minutes;
