import { transaction } from '../../../../scripts/lib/database.mjs';

export class AnalysisService {
  constructor(pool, graph) {
    this.pool = pool;
    this.graph = graph;
    this.progress = new Map();
  }
  report(id, stage, detail) {
    this.progress.delete(id);
    this.progress.set(id, { stage, detail, updated_at: new Date().toISOString() });
    if (this.progress.size > 200) this.progress.delete(this.progress.keys().next().value);
  }
  async refreshGraph() {
    const client = await this.pool.connect();
    try {
      return await transaction(client, () => this.graph.sync(client));
    } finally {
      client.release();
    }
  }
  async analyze(id) {
    const client = await this.pool.connect();
    try {
      const result = await transaction(client, async () => {
        await client.query("select pg_advisory_xact_lock(hashtext('railway:analysis:' || $1::text))", [id]);
        const {
          rows: [d],
        } = await client.query('select * from public.disruptions where id=$1', [id]);
        if (!d) throw Object.assign(new Error('Disruption not found'), { status: 404 });
        if (d.analysis_status === 'COMPLETED')
          return { disruption_id: id, analysis_status: 'COMPLETED', already_analyzed: true };
        if (['RESOLVED', 'CANCELLED'].includes(d.status))
          throw Object.assign(new Error('Disruption is closed'), { status: 409 });
        await client.query(
          "update public.disruptions set status='ANALYZING',analysis_status='PROCESSING' where id=$1",
          [id],
        );
        this.report(id, 'network', 'Refreshing the railway routing network from PostgreSQL.');
        await this.graph.sync(client);
        this.report(id, 'impact', 'Checking remaining journeys for affected stations and track segments.');
        const { rows: affected } = await client.query('select * from public.fn_affected_journeys($1)', [
          id,
        ]);
        let recommendations = 0;
        for (const journey of affected) {
          this.report(
            id,
            'routing',
            `Searching alternate paths for journey ${affected.indexOf(journey) + 1} of ${affected.length}.`,
          );
          await client.query('call public.sp_record_affected_train($1,$2,$3::public.impact_type,0)', [
            id,
            journey.train_journey_id,
            journey.impact_type,
          ]);
          const route = journey.remaining_route;
          const candidates = await this.graph.routes(route[0], route.at(-1), d.track_id ? [d.track_id] : []);
          // Persist the best feasible candidate; graph cost is a suggestion only.
          let stored = false;
          for (const candidate of candidates) {
            this.report(
              id,
              'validation',
              'Checking candidate track availability and travel times in PostgreSQL.',
            );
            const {
              rows: [metrics],
            } = await client.query('select * from public.fn_validate_route($1::jsonb)', [
              JSON.stringify(candidate.stationCodes),
            ]);
            if (!metrics.is_valid) continue;
            const {
              rows: [original],
            } = await client.query('select * from public.fn_validate_route($1::jsonb)', [
              JSON.stringify(route),
            ]);
            const {
              rows: [delay],
            } = await client.query('select public.fn_estimate_delay_minutes($1,60,$2::public.disruption_severity) as minutes', [
              Math.max(0, Number(metrics.distance_km) - Number(original.distance_km)),
              d.severity,
            ]);
            await client.query(
              'call public.sp_store_route_recommendation($1,$2,$3::jsonb,$4::jsonb,$5,$6,$7,$8)',
              [
                id,
                journey.train_journey_id,
                JSON.stringify(route),
                JSON.stringify(candidate.stationCodes),
                metrics.distance_km,
                metrics.travel_minutes,
                delay.minutes,
                metrics.travel_minutes + delay.minutes,
              ],
            );
            await client.query('call public.sp_record_affected_train($1,$2,$3::public.impact_type,$4)', [
              id,
              journey.train_journey_id,
              journey.impact_type,
              delay.minutes,
            ]);
            recommendations++;
            stored = true;
            break;
          }
          if (!stored)
            await client.query(
              "update public.affected_trains set status='WAITING' where disruption_id=$1 and train_journey_id=$2 and status='PENDING'",
              [id, journey.train_journey_id],
            );
        }
        await client.query('call public.sp_mark_disruption_analyzed($1)', [id]);
        this.report(id, 'saving', 'Saving affected journeys, route proposals and event history together.');
        return {
          disruption_id: id,
          analysis_status: 'COMPLETED',
          affected_trains: affected.length,
          recommendations,
        };
      });
      this.report(id, 'complete', 'Analysis committed. Results are ready to review.');
      return result;
    } catch (error) {
      this.report(
        id,
        'retry',
        'Analysis could not finish. The worker will retry eligible events; inspect event activity for the outcome.',
      );
      throw error;
    } finally {
      client.release();
    }
  }
}
