import { transaction } from '../../../../scripts/lib/database.mjs';
export async function createDisruption(pool, input) {
  const client = await pool.connect();
  try {
    return await transaction(client, async () => {
      const kind = input.track_id ? 'tracks' : 'stations';
      const target = input.track_id ?? input.station_id;
      const { rows } = await client.query(`select id from railway_main.${kind} where id=$1 for update`, [
        target,
      ]);
      if (!rows.length) throw Object.assign(new Error('Target not found'), { status: 404 });
      const { rows: existing } = await client.query(
        `select id from railway_main.disruptions
        where (track_id=$1 or station_id=$1) and status in ('OPEN','ANALYZING')`,
        [target],
      );
      if (existing.length)
        throw Object.assign(new Error('Target already has an unresolved disruption'), { status: 409 });
      const {
        rows: [d],
      } = await client.query(
        `insert into railway_main.disruptions(type,track_id,station_id,severity,reported_by,description,geom)
        values($1,$2,$3,$4,$5,$6,case when $2::uuid is not null then
          (select extensions.ST_LineInterpolatePoint(geom::extensions.geometry,0.5)::extensions.geography from railway_main.tracks where id=$2)
          else (select geom from railway_main.stations where id=$3) end) returning *`,
        [
          input.type,
          input.track_id ?? null,
          input.station_id ?? null,
          input.severity,
          'api-operator',
          input.description ?? null,
        ],
      );
      if (input.type === 'TRACK_FAILURE')
        await client.query("update railway_main.tracks set status='FAILED' where id=$1", [input.track_id]);
      if (input.type === 'STATION_CLOSURE')
        await client.query("update railway_main.stations set status='CLOSED' where id=$1", [
          input.station_id,
        ]);
      return d;
    });
  } finally {
    client.release();
  }
}
