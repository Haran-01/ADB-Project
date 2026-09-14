-- @check postgis_geojson
select case when railway_main.fn_network_geojson()->>'type'='FeatureCollection'
  and jsonb_array_length(railway_main.fn_network_geojson()->'features')=
    (select count(*) from railway_main.stations)+(select count(*) from railway_main.tracks)
  then 'PASS' else 'FAIL' end as status,'all station and track features' as expected;
-- @end

-- @check postgis_intersection
select case when exists(select 1 from railway_main.fn_affected_tracks(
  '{"type":"Polygon","coordinates":[[[79,11],[81,11],[81,14],[79,14],[79,11]]]}'::jsonb))
  then 'PASS' else 'FAIL' end as status,'tracks intersect Chennai area polygon' as expected;
-- @end

-- @check postgis_distance_ordering
with nearby as (
  select * from railway_main.fn_find_nearby_stations(
    (select geom from railway_main.stations where station_code='CGL'),100)
), ranked as (select *,lag(distance_km) over(order by distance_km) previous from nearby)
select case when count(*)>1 and bool_and(previous is null or distance_km>=previous)
  then 'PASS' else 'FAIL' end as status,'distance ranking in kilometres' as expected from ranked;
-- @end
