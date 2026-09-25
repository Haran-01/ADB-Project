-- Spatial distances: geography operations use metres; public distances use km.
create or replace function public.fn_network_geojson() returns jsonb
language sql stable set search_path=public,railway_south,railway_central,railway_north,extensions,pg_temp as $$
select jsonb_build_object('type','FeatureCollection','features',coalesce(jsonb_agg(feature),'[]'::jsonb))
from (
  select jsonb_build_object('type','Feature','id',id,'geometry',ST_AsGeoJSON(geom)::jsonb,
    'properties',jsonb_build_object('kind','station','station_code',station_code,'name',name,'status',status)) feature
  from stations
  union all
  select jsonb_build_object('type','Feature','id',id,'geometry',ST_AsGeoJSON(geom)::jsonb,
    'properties',jsonb_build_object('kind','track','from_station_id',from_station_id,'to_station_id',to_station_id,
      'status',status,'distance_km',distance_km,'geometry_distance_km',round((ST_Length(geom)/1000.0)::numeric, 2))) from tracks
) f;
$$;

create or replace function public.fn_affected_tracks(p_area jsonb)
returns table(track_id uuid,distance_km numeric)
language sql stable set search_path=public,railway_south,railway_central,railway_north,extensions,pg_temp as $$
  select id,distance_km from tracks
  where ST_Intersects(geom,ST_SetSRID(ST_GeomFromGeoJSON(p_area),4326)::geography);
$$;

create or replace function public.fn_get_active_track_availability(
  p_track_id uuid,p_at_time timestamptz default now())
returns table(track_id uuid,status public.track_status,is_available boolean,valid_from timestamptz,valid_to timestamptz)
language sql stable set search_path=public,railway_south,railway_central,railway_north,extensions,pg_temp as $$
  select tr.id,tr.status,
    tr.status='ACTIVE' and tr.valid_from<=p_at_time and (tr.valid_to is null or tr.valid_to>p_at_time)
    and fs.status='ACTIVE' and ts.status='ACTIVE'
    and not exists(select 1 from disruptions d where d.status in ('OPEN','ANALYZING')
      and d.started_at<=p_at_time and (d.ended_at is null or d.ended_at>p_at_time)
      and (d.track_id=tr.id or d.station_id in (tr.from_station_id,tr.to_station_id))),
    tr.valid_from,tr.valid_to
  from tracks tr join stations fs on fs.id=tr.from_station_id join stations ts on ts.id=tr.to_station_id
  where tr.id=p_track_id;
$$;

create or replace function public.fn_validate_route(p_route jsonb,p_depart_at timestamptz default now())
returns table(is_valid boolean,distance_km numeric,travel_minutes integer)
language sql stable set search_path=public,railway_south,railway_central,railway_north,extensions,pg_temp as $$
  with codes as (
    select value as code,ordinality as seq from jsonb_array_elements_text(p_route) with ordinality
  ), edges as (
    select a.seq,t.id,t.from_station_id,t.to_station_id,t.distance_km,t.valid_to,ceil(t.distance_km/t.speed_limit_kmph*60)::integer minutes
    from codes a join codes b on b.seq=a.seq+1
    left join stations fs on fs.station_code=a.code left join stations ts on ts.station_code=b.code
    left join tracks t on t.from_station_id=fs.id and t.to_station_id=ts.id
  ), timed as (
    select *,coalesce(sum(minutes) over(order by seq rows between unbounded preceding and 1 preceding),0) elapsed from edges
  )
  select coalesce(count(*)=jsonb_array_length(p_route)-1 and count(*)>0
    and bool_and(id is not null and coalesce((select is_available from fn_get_active_track_availability(
      id,p_depart_at+elapsed*interval '1 minute')),false)
      and (valid_to is null or valid_to>p_depart_at+(elapsed+minutes)*interval '1 minute')
      and not exists(select 1 from disruptions d where d.status in ('OPEN','ANALYZING')
        and (d.track_id=timed.id or d.station_id in (timed.from_station_id,timed.to_station_id))
        and d.started_at<p_depart_at+(elapsed+minutes)*interval '1 minute'
        and (d.ended_at is null or d.ended_at>p_depart_at+elapsed*interval '1 minute'))),false),
    coalesce(sum(distance_km),0),coalesce(sum(minutes),0)::integer from timed;
$$;

-- The effective remaining route is the applied route, otherwise the ordered schedule.
create or replace function public.fn_remaining_route(p_journey_id uuid) returns jsonb
language sql stable set search_path=public,railway_south,railway_central,railway_north,extensions,pg_temp as $$
  with journey as (
    select j.*,s.station_code as current_code,coalesce(j.active_route,(select jsonb_agg(st.station_code order by sch.stop_sequence)
      from train_schedules sch join stations st on st.id=sch.station_id where sch.train_id=j.train_id)) route
    from train_journeys j left join stations s on s.id=j.current_station_id where j.id=p_journey_id
  ), stops as (select value,ordinality,journey.current_code from journey,
    lateral jsonb_array_elements_text(route) with ordinality)
  select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb) from stops
  where ordinality>=coalesce((select min(ordinality) from stops where value=current_code),1);
$$;

create or replace function public.fn_affected_journeys(p_disruption_id uuid)
returns table(train_journey_id uuid,train_id uuid,impact_type public.impact_type,remaining_route jsonb)
language sql stable set search_path=public,railway_south,railway_central,railway_north,extensions,pg_temp as $$
  with d as (select d.*,fs.station_code from_code,ts.station_code to_code,s.station_code target_code
    from disruptions d left join tracks t on t.id=d.track_id
    left join stations fs on fs.id=t.from_station_id left join stations ts on ts.id=t.to_station_id
    left join stations s on s.id=d.station_id where d.id=p_disruption_id),
  candidates as (select j.*,fn_remaining_route(j.id) route from train_journeys j
    where j.journey_status in ('SCHEDULED','RUNNING','DELAYED','REROUTED')
      and j.journey_date<=current_date and j.journey_date>=current_date-1)
  select j.id,j.train_id,case when d.station_id is not null then 'STATION_CLOSURE'::impact_type else 'DIRECT_TRACK_BLOCK'::impact_type end,j.route
  from candidates j cross join d where
    (d.station_id is not null and j.route ? d.target_code) or exists(
      select 1 from jsonb_array_elements_text(j.route) with ordinality a(code,seq)
      join jsonb_array_elements_text(j.route) with ordinality b(code,seq) on b.seq=a.seq+1
      where (a.code=d.from_code and b.code=d.to_code));
$$;

create or replace function public.fn_estimate_delay_minutes(
  p_extra_distance_km numeric,p_speed_limit_kmph integer,p_severity public.disruption_severity)
returns integer language plpgsql immutable as $$
begin
  if p_extra_distance_km is null or p_extra_distance_km<0 or p_speed_limit_kmph is null or p_speed_limit_kmph<=0 or p_severity is null then
    raise exception 'Delay inputs require nonnegative distance, positive speed and severity' using errcode='22023';
  end if;
  return ceil(p_extra_distance_km/p_speed_limit_kmph*60*case p_severity
    when 'LOW' then 1.10 when 'MEDIUM' then 1.25 when 'HIGH' then 1.50 else 2.00 end)::integer;
end $$;
