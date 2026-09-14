-- @check phase7_track_failure_history_outbox
do $$ declare t uuid; n integer; begin
  select tr.id into t from railway_main.tracks tr
  where status='ACTIVE' and not exists(select 1 from railway_main.disruptions where track_id=tr.id and status in ('OPEN','ANALYZING')) limit 1;
  select count(*) into n from railway_main.track_status_history where track_id=t;
  update railway_main.tracks set status='FAILED' where id=t;
  if (select count(*) from railway_main.track_status_history where track_id=t)<>n+1 then raise exception 'Missing track history'; end if;
  if not exists(select 1 from railway_main.disruptions d join railway_main.event_log e on e.entity_id=d.id
    where d.track_id=t and e.event_type='DISRUPTION_CREATED') then raise exception 'Missing disruption outbox event'; end if;
  update railway_main.tracks set status='FAILED' where id=t;
  if (select count(*) from railway_main.track_status_history where track_id=t)<>n+1 then raise exception 'Duplicate no-op history'; end if;
end $$;
select 'PASS' as status,'track failure and no-op verified' as actual,'one history entry and durable event' as expected;
-- @end

-- @check impact_aggregation_regression
select case when not exists (
  select 1 from railway_main.v_disruption_impact_summary v where total_estimated_delay_minutes<>
    coalesce((select sum(estimated_delay_minutes) from railway_main.affected_trains where disruption_id=v.disruption_id),0)
) then 'PASS' else 'FAIL' end as status,'independent aggregates' as expected;
-- @end
