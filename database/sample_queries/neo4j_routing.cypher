// Execute after npm run graph:sync. Full query is bounded to the 25-station MVP.
MATCH p=(a:RailwayStation {stationCode:'CGL'})-[:CONNECTED_TO*1..12]->(b:RailwayStation {stationCode:'TPJ'})
WHERE all(r IN relationships(p) WHERE r.available=true AND r.status='ACTIVE')
  AND all(n IN nodes(p) WHERE n.available=true AND single(m IN nodes(p) WHERE m=n))
RETURN [n IN nodes(p)|n.stationCode] AS stations,
  reduce(cost=0.0,r IN relationships(p)|cost+r.travelMinutes) AS travelMinutes
ORDER BY travelMinutes LIMIT 3;
