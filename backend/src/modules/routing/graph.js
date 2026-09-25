export const routeQuery = `
  MATCH p=(a:RailwayStation {stationCode:$from,projection:$projection})
    -[:CONNECTED_TO*1..12]->(b:RailwayStation {stationCode:$to,projection:$projection})
  WHERE all(n IN nodes(p) WHERE n.projection=$projection AND n.available=true
    AND single(m IN nodes(p) WHERE m=n))
    AND all(r IN relationships(p) WHERE r.projection=$projection AND r.available=true
      AND NOT r.trackId IN $excludeTracks)
  WITH p,reduce(cost=0.0,r IN relationships(p)|cost+r.travelMinutes) AS travelMinutes
  RETURN [n IN nodes(p)|n.stationCode] AS stationCodes,
    [r IN relationships(p)|r.trackId] AS trackIds,
    reduce(cost=0.0,r IN relationships(p)|cost+r.distanceKm) AS distanceKm,travelMinutes
  ORDER BY travelMinutes,stationCodes LIMIT 3`;

export class GraphProjection {
  constructor(driver, database = 'neo4j', projection = 'railway-main') {
    this.driver = driver;
    this.database = database;
    this.projection = projection;
  }
  async health() {
    const session = this.driver.session({ database: this.database });
    try {
      await session.executeRead((tx) => tx.run('RETURN 1 AS ok'));
      return true;
    } finally {
      await session.close();
    }
  }
  async initialize() {
    const session = this.driver.session({ database: this.database });
    try {
      await session.run(
        'CREATE CONSTRAINT railway_station_id IF NOT EXISTS FOR (s:RailwayStation) REQUIRE s.stationId IS UNIQUE',
      );
    } finally {
      await session.close();
    }
  }
  async sync(client) {
    // Caller holds a PostgreSQL transaction. Serialize source snapshots and graph replacement.
    await client.query("select pg_advisory_xact_lock(hashtext('railway:graph-sync'))");
    const stations = (
      await client.query(`select s.id as "stationId",s.station_code as "stationCode",s.name,
      r.code as "regionCode",s.latitude::float8,s.longitude::float8,s.status,
      s.status='ACTIVE' and not exists(select 1 from public.disruptions d where d.station_id=s.id
        and d.status in ('OPEN','ANALYZING') and d.started_at<=now() and (d.ended_at is null or d.ended_at>now())) as available
      from public.stations s join public.regions r on r.id=s.region_id`)
    ).rows;
    const tracks = (
      await client.query(`select t.id as "trackId",t.from_station_id as "fromId",t.to_station_id as "toId",
      t.distance_km::float8 as "distanceKm",t.speed_limit_kmph as "speedLimitKmph",
      ceil(t.distance_km/t.speed_limit_kmph*60)::float8 as "travelMinutes",t.status,r.code as region,
      r.code as "regionCode",a.is_available as available,
      extract(epoch from t.valid_from)*1000 as "validFrom",extract(epoch from t.valid_to)*1000 as "validTo"
      from public.tracks t join public.regions r on r.id=t.region_id
      cross join lateral public.fn_get_active_track_availability(t.id) a`)
    ).rows.map((t) => ({
      ...t,
      validFrom: Number(t.validFrom),
      validTo: t.validTo === null ? null : Number(t.validTo),
    }));
    const session = this.driver.session({ database: this.database });
    try {
      await session.executeWrite(async (tx) => {
        await tx.run(
          `MATCH (:RailwayStation {projection:$projection})-[r:CONNECTED_TO {projection:$projection}]->() DELETE r`,
          { projection: this.projection },
        );
        await tx.run(
          `MATCH (s:RailwayStation {projection:$projection}) WHERE NOT s.stationId IN $ids DETACH DELETE s`,
          { ids: stations.map((s) => s.stationId), projection: this.projection },
        );
        await tx.run(
          `UNWIND $stations AS row MERGE (s:RailwayStation {stationId:row.stationId}) SET s=row,s.projection=$projection`,
          { stations, projection: this.projection },
        );
        await tx.run(
          `UNWIND $tracks AS row MATCH (a:RailwayStation {stationId:row.fromId}),(b:RailwayStation {stationId:row.toId})
          CREATE (a)-[r:CONNECTED_TO]->(b) SET r=row,r.projection=$projection`,
          { tracks, projection: this.projection },
        );
      });
      return { stations: stations.length, tracks: tracks.length };
    } finally {
      await session.close();
    }
  }
  async routes(from, to, excludeTracks = []) {
    if (from === to) return [];
    const session = this.driver.session({ database: this.database });
    try {
      const result = await session.executeRead(
        (tx) => tx.run(routeQuery, { from, to, excludeTracks, projection: this.projection }),
        { timeout: 10000 },
      );
      return result.records.map((r) => r.toObject());
    } finally {
      await session.close();
    }
  }
}
