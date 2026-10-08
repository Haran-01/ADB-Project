/**
 * Distributed Query & Cross-Fragment JOIN Engine
 * 
 * Provides fragment routing, scatter-gather queries, and cross-node JOIN execution
 * across regional database fragments (railway_south, railway_central, railway_north).
 */

export const REGIONS = ['south', 'central', 'north'];
export const REGION_SCHEMAS = {
  south: 'railway_south',
  central: 'railway_central',
  north: 'railway_north',
};

export class DistributedQueryEngine {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Execute a query against a specific regional fragment node
   */
  async queryFragment(regionKey, sql, params = []) {
    const schema = REGION_SCHEMAS[regionKey];
    if (!schema) throw new Error('Unknown regional fragment');
    const formattedSql = sql.replace(/\{schema\}/g, schema);
    const { rows } = await this.pool.query(formattedSql, params);
    return rows;
  }

  /**
   * Scatter-Gather: Execute queries concurrently across all regional node fragments and combine results
   */
  async scatterGather(table, orderColumn = 'id', limit = 100, offset = 0) {
    if (!['stations', 'tracks', 'trains', 'train_schedules'].includes(table))
      throw new Error('Unsupported fragment table');
    const order = orderColumn.split(',').map((part) => {
      const match = part.trim().match(/^([a-z_][a-z0-9_]*)(?: +(asc|desc))?$/i);
      if (!match) throw new Error('Invalid fragment order');
      return { column: match[1], direction: match[2]?.toLowerCase() === 'desc' ? -1 : 1 };
    });
    if (!order.some(({ column }) => column === 'id')) order.push({ column: 'id', direction: 1 });
    const sqlOrder = order.map(({ column, direction }) => `${column} ${direction === 1 ? 'asc' : 'desc'}`).join(',');
    const fragmentResults = await Promise.all(REGIONS.map((region) =>
      this.queryFragment(region,
        `select '${region}' as source_fragment, * from {schema}.${table} order by ${sqlOrder} limit $1 offset $2`,
        [limit + offset, 0]),
    ));
    const combined = fragmentResults.flat();
    combined.sort((a, b) => {
      for (const { column, direction } of order) {
        if (a[column] == null && b[column] == null) continue;
        if (a[column] == null) return direction;
        if (b[column] == null) return -direction;
        if (a[column] < b[column]) return -direction;
        if (a[column] > b[column]) return direction;
      }
      return 0;
    });
    return combined.slice(offset, offset + limit);
  }

  /**
   * Cross-Fragment JOIN: Performs a key-based JOIN across data retrieved from distinct regional database fragments
   * 
   * Conceptually joins:
   *   [South_Trains UNION Central_Trains UNION North_Trains]
   *         JOIN
   *   [South_Schedules UNION Central_Schedules UNION North_Schedules]
   *         JOIN
   *   [South_Stations UNION Central_Stations UNION North_Stations]
   */
  async crossFragmentJoinTrainSchedules(trainId = null) {
    // Step 1: Fragment Retrieval - Scatter queries across regional train nodes
    const trainFragments = await Promise.all(
      REGIONS.map((r) =>
        this.queryFragment(
          r,
          `select '${r}' as train_region_fragment, * from {schema}.trains ${trainId ? 'where id = $1' : ''}`,
          trainId ? [trainId] : []
        )
      )
    );
    const trains = trainFragments.flat();

    // Step 2: Fragment Retrieval - Scatter queries across regional schedule nodes
    const scheduleFragments = await Promise.all(
      REGIONS.map((r) =>
        this.queryFragment(
          r,
          `select '${r}' as schedule_region_fragment, * from {schema}.train_schedules ${trainId ? 'where train_id = $1' : ''}`,
          trainId ? [trainId] : []
        )
      )
    );
    const schedules = scheduleFragments.flat();

    // Step 3: Fragment Retrieval - Scatter queries across regional station nodes
    const stationFragments = await Promise.all(
      REGIONS.map((r) =>
        this.queryFragment(r, `select '${r}' as station_region_fragment, * from {schema}.stations`)
      )
    );
    const stations = stationFragments.flat();

    // Step 4: Cross-Fragment JOIN / MERGE in memory (Key-based Hash Join)
    const stationMap = new Map(stations.map((s) => [s.id, s]));

    const schedulesByTrain = new Map();
    for (const schedule of schedules) {
      if (!schedulesByTrain.has(schedule.train_id)) schedulesByTrain.set(schedule.train_id, []);
      schedulesByTrain.get(schedule.train_id).push(schedule);
    }
    const joinedResults = trains.map((train) => {
      const trainSchedules = (schedulesByTrain.get(train.id) ?? [])
        .sort((a, b) => a.stop_sequence - b.stop_sequence)
        .map((sch) => {
          const station = stationMap.get(sch.station_id);
          return {
            stop_sequence: sch.stop_sequence,
            station_code: station ? station.station_code : null,
            station_name: station ? station.name : null,
            scheduled_arrival: sch.scheduled_arrival,
            scheduled_departure: sch.scheduled_departure,
            day_offset: sch.day_offset,
            platform: sch.platform,
            schedule_fragment: sch.schedule_region_fragment,
            station_fragment: station ? station.station_region_fragment : null,
          };
        });

      return {
        ...train,
        schedule_count: trainSchedules.length,
        schedules: trainSchedules,
      };
    });

    return joinedResults;
  }
}
