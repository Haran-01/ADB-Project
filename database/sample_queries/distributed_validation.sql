-- @scope invariant
-- @check distributed_regional_views
select case when count(*)=6 then 'PASS' else 'FAIL' end status,
  count(*) actual,'six regional station/track views' expected from information_schema.views
where table_schema in ('railway_south','railway_central','railway_north') and table_name in ('stations','tracks');
-- @end

-- @scope scenario
-- @check distributed_cross_region_journey
select case when exists(select 1 from railway_main.v_cross_region_journeys where region_count>=2) then 'PASS' else 'FAIL' end status,
  'at least one cross-region journey' expected;
-- @end
