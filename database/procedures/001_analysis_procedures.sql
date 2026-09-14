create or replace procedure railway_main.sp_record_affected_train(
  p_disruption_id uuid,p_train_journey_id uuid,p_impact_type railway_main.impact_type,
  p_estimated_delay_minutes integer,p_status railway_main.affected_train_status default 'PENDING')
language plpgsql set search_path=railway_main,extensions,pg_temp as $$
begin
  if not exists(select 1 from disruptions where id=p_disruption_id and status in ('OPEN','ANALYZING')) then
    raise exception 'Disruption is missing or closed' using errcode='22023';
  end if;
  insert into affected_trains(disruption_id,train_journey_id,impact_type,estimated_delay_minutes,status)
  values(p_disruption_id,p_train_journey_id,p_impact_type,p_estimated_delay_minutes,p_status)
  on conflict(disruption_id,train_journey_id) do update set impact_type=excluded.impact_type,
    estimated_delay_minutes=excluded.estimated_delay_minutes,status=excluded.status
  where affected_trains.status not in ('REROUTED','CANCELLED','CLEARED');
end $$;

create or replace procedure railway_main.sp_store_route_recommendation(
  p_disruption_id uuid,p_train_journey_id uuid,p_original_route jsonb,p_recommended_route jsonb,
  p_distance_km numeric,p_estimated_travel_minutes integer,p_estimated_delay_minutes integer,
  p_score numeric,p_status railway_main.recommendation_status default 'PROPOSED')
language plpgsql set search_path=railway_main,extensions,pg_temp as $$
declare metrics record; j train_journeys;
begin
  perform 1 from disruptions where id=p_disruption_id and status in ('OPEN','ANALYZING') for update;
  if not found then raise exception 'Disruption is missing or closed' using errcode='22023'; end if;
  select * into j from train_journeys where id=p_train_journey_id for update;
  if j.id is null or j.journey_status in ('COMPLETED','CANCELLED') or p_status<>'PROPOSED' then
    raise exception 'Cannot propose route for this journey or status' using errcode='22023';
  end if;
  select * into metrics from fn_validate_route(p_recommended_route);
  if not metrics.is_valid then raise exception 'Route is unavailable or disconnected' using errcode='22023'; end if;
  if p_recommended_route->>0 is distinct from fn_remaining_route(j.id)->>0
    or p_recommended_route->>-1 is distinct from fn_remaining_route(j.id)->>-1 then
    raise exception 'Route endpoints must match remaining journey' using errcode='22023';
  end if;
  -- Caller estimates cannot override authoritative network distance and time.
  if abs(metrics.distance_km-p_distance_km)>0.01 or metrics.travel_minutes<>p_estimated_travel_minutes then
    raise exception 'Route metrics do not match PostgreSQL network' using errcode='22023';
  end if;
  if exists(select 1 from route_recommendations where disruption_id=p_disruption_id and train_journey_id=p_train_journey_id
    and recommended_route=p_recommended_route and status in ('PROPOSED','ACCEPTED','APPLIED')) then return; end if;
  insert into route_recommendations(disruption_id,train_journey_id,original_route,recommended_route,distance_km,
    estimated_travel_minutes,estimated_delay_minutes,score,status)
  values(p_disruption_id,p_train_journey_id,p_original_route,p_recommended_route,metrics.distance_km,
    metrics.travel_minutes,p_estimated_delay_minutes,p_score,p_status);
end $$;

create or replace procedure railway_main.sp_mark_disruption_analyzed(
  p_disruption_id uuid,p_changed_by text default 'database-procedure',p_note text default 'Disruption analysis completed')
language plpgsql set search_path=railway_main,extensions,pg_temp as $$
declare d disruptions;
begin
  select * into d from disruptions where id=p_disruption_id for update;
  if d.id is null or d.status in ('RESOLVED','CANCELLED') then
    raise exception 'Disruption is missing or closed' using errcode='22023';
  end if;
  if d.analysis_status='COMPLETED' then return; end if;
  if d.analysis_status<>'PROCESSING' then raise exception 'Analysis has not started' using errcode='22023'; end if;
  perform set_config('railway.actor',p_changed_by,true);
  -- Completing analysis does not repair the physical disruption.
  update disruptions set analysis_status='COMPLETED',analyzed_at=now() where id=d.id;
end $$;

create or replace procedure railway_main.sp_apply_route_recommendation(
  p_recommendation_id uuid,p_changed_by text default 'database-procedure')
language plpgsql set search_path=railway_main,extensions,pg_temp as $$
declare r route_recommendations; j train_journeys; metrics record; d disruptions;
begin
  select dd.* into d from disruptions dd join route_recommendations rr on rr.disruption_id=dd.id
    where rr.id=p_recommendation_id for update of dd;
  -- Serialize all competing recommendations for the same journey, not just this row.
  select tj.* into j from train_journeys tj join route_recommendations rr on rr.train_journey_id=tj.id
    where rr.id=p_recommendation_id for update of tj;
  if j.id is null then raise exception 'Recommendation not found' using errcode='P0002'; end if;
  select * into r from route_recommendations where id=p_recommendation_id for update;
  if r.status='APPLIED' then return; end if;
  if d.status in ('RESOLVED','CANCELLED') then raise exception 'Disruption is closed' using errcode='22023'; end if;
  if r.status not in ('PROPOSED','ACCEPTED') or j.journey_status in ('COMPLETED','CANCELLED') then
    raise exception 'Recommendation cannot be applied in current state' using errcode='22023';
  end if;
  if not exists(select 1 from affected_trains where disruption_id=r.disruption_id and train_journey_id=j.id)
    or exists(select 1 from route_recommendations where train_journey_id=j.id and status='APPLIED') then
    raise exception 'Missing affected journey or a route is already applied' using errcode='22023';
  end if;
  perform 1 from tracks t join stations s on s.id=t.from_station_id where r.recommended_route ? s.station_code for share of t;
  select * into metrics from fn_validate_route(r.recommended_route);
  if not metrics.is_valid or r.recommended_route->>0 is distinct from fn_remaining_route(j.id)->>0 then
    raise exception 'Route is no longer feasible from current position' using errcode='22023';
  end if;
  perform set_config('railway.actor',p_changed_by,true);
  update route_recommendations set status='APPLIED' where id=r.id;
  update route_recommendations set status='EXPIRED' where train_journey_id=j.id and id<>r.id and status in ('PROPOSED','ACCEPTED');
  update affected_trains set status='REROUTED' where disruption_id=r.disruption_id and train_journey_id=j.id;
  update train_journeys set journey_status='REROUTED',active_route=r.recommended_route,
    next_station_id=(select id from stations where station_code=r.recommended_route->>1),
    delay_minutes=greatest(delay_minutes,r.estimated_delay_minutes) where id=j.id;
end $$;
