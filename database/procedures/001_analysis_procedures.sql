-- Phase 6 procedures: controlled database-side mutations for later orchestration.

create or replace procedure railway_main.sp_record_affected_train(
  p_disruption_id uuid,
  p_train_journey_id uuid,
  p_impact_type railway_main.impact_type,
  p_estimated_delay_minutes integer,
  p_status railway_main.affected_train_status default 'PENDING'::railway_main.affected_train_status
)
language plpgsql
as $$
begin
  insert into railway_main.affected_trains (
    disruption_id,
    train_journey_id,
    impact_type,
    estimated_delay_minutes,
    status
  )
  values (
    p_disruption_id,
    p_train_journey_id,
    p_impact_type,
    greatest(0, p_estimated_delay_minutes),
    p_status
  )
  on conflict (disruption_id, train_journey_id)
  do update set
    impact_type = excluded.impact_type,
    estimated_delay_minutes = excluded.estimated_delay_minutes,
    status = excluded.status,
    updated_at = now();
end;
$$;

create or replace procedure railway_main.sp_store_route_recommendation(
  p_disruption_id uuid,
  p_train_journey_id uuid,
  p_original_route jsonb,
  p_recommended_route jsonb,
  p_distance_km numeric,
  p_estimated_travel_minutes integer,
  p_estimated_delay_minutes integer,
  p_score numeric,
  p_status railway_main.recommendation_status default 'PROPOSED'::railway_main.recommendation_status
)
language plpgsql
as $$
begin
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
  values (
    p_disruption_id,
    p_train_journey_id,
    p_original_route,
    p_recommended_route,
    p_distance_km,
    p_estimated_travel_minutes,
    greatest(0, p_estimated_delay_minutes),
    greatest(0, p_score),
    p_status
  );
end;
$$;

create or replace procedure railway_main.sp_mark_disruption_analyzed(
  p_disruption_id uuid,
  p_changed_by text default 'database-procedure',
  p_note text default 'Disruption analysis completed'
)
language plpgsql
as $$
declare
  v_old_status railway_main.disruption_status;
begin
  select status into v_old_status
  from railway_main.disruptions
  where id = p_disruption_id
  for update;

  if v_old_status is null then
    raise exception 'Disruption % not found', p_disruption_id;
  end if;

  update railway_main.disruptions
  set status = 'RESOLVED'::railway_main.disruption_status,
      ended_at = coalesce(ended_at, now()),
      updated_at = now()
  where id = p_disruption_id;

  insert into railway_main.disruption_history (
    disruption_id,
    old_status,
    new_status,
    changed_at,
    changed_by,
    note
  )
  values (
    p_disruption_id,
    v_old_status,
    'RESOLVED'::railway_main.disruption_status,
    now(),
    p_changed_by,
    p_note
  );
end;
$$;

create or replace procedure railway_main.sp_apply_route_recommendation(
  p_recommendation_id uuid,
  p_changed_by text default 'database-procedure'
)
language plpgsql
as $$
declare
  v_train_journey_id uuid;
  v_disruption_id uuid;
begin
  select train_journey_id, disruption_id
  into v_train_journey_id, v_disruption_id
  from railway_main.route_recommendations
  where id = p_recommendation_id
  for update;

  if v_train_journey_id is null then
    raise exception 'Recommendation % not found', p_recommendation_id;
  end if;

  update railway_main.route_recommendations
  set status = 'APPLIED'::railway_main.recommendation_status,
      updated_at = now()
  where id = p_recommendation_id;

  update railway_main.affected_trains
  set status = 'REROUTED'::railway_main.affected_train_status,
      updated_at = now()
  where disruption_id = v_disruption_id
    and train_journey_id = v_train_journey_id;

  update railway_main.train_journeys
  set journey_status = 'REROUTED'::railway_main.journey_status,
      updated_at = now()
  where id = v_train_journey_id;
end;
$$;

