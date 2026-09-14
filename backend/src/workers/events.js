import { randomUUID } from 'node:crypto';
import { connect } from '../../../scripts/lib/database.mjs';

export const socketEvents = {
  DISRUPTION_CREATED: 'disruption.created',
  DISRUPTION_ANALYSIS_REQUESTED: 'disruption.analysis_started',
  DISRUPTION_ANALYSIS_COMPLETED: 'disruption.analysis_completed',
  TRAIN_AFFECTED: 'train.affected',
  ROUTE_RECOMMENDED: 'route.recommended',
  JOURNEY_STATUS_CHANGED: 'train.status_updated',
  TRAIN_STATUS_CHANGED: 'train.status_updated',
};
export class EventWorker {
  constructor({ pool, analysis, io, env, listenerFactory = connect, logger = console }) {
    Object.assign(this, { pool, analysis, io, env, listenerFactory, logger });
    this.stopped = true;
    this.listener = null;
    this.pending = null;
  }
  async claim() {
    const token = randomUUID();
    const { rows } = await this.pool.query(
      `with candidate as (
      select id from railway_main.event_log where attempts<5 and
      ((status='PENDING' and available_at<=now()) or (status='PROCESSING' and locked_at<now()-interval '120 seconds'))
      order by event_sequence for update skip locked limit 1)
      update railway_main.event_log e set status='PROCESSING',attempts=attempts+1,locked_at=now(),lock_token=$1
      from candidate c where e.id=c.id returning e.*`,
      [token],
    );
    // A crashed final attempt must not leave a row permanently PROCESSING.
    await this.pool.query(`update railway_main.event_log set status='FAILED',lock_token=null,locked_at=null,
      last_error='Worker lease expired after final attempt' where status='PROCESSING' and attempts>=5
      and locked_at<now()-interval '120 seconds'`);
    return rows[0];
  }
  async process(event) {
    const name = socketEvents[event.event_type];
    if (name)
      this.io.emit(name, { event_id: event.id, event_sequence: event.event_sequence, ...event.payload });
    if (
      ['TRACK_STATUS_CHANGED', 'NETWORK_CHANGED'].includes(event.event_type) &&
      this.analysis.refreshGraph
    ) {
      // A rebuild includes every preceding committed network change; coalesce old events.
      const {
        rows: [newer],
      } = await this.pool.query(
        `select exists(select 1 from railway_main.event_log
        where event_type in ('TRACK_STATUS_CHANGED','NETWORK_CHANGED') and event_sequence>$1
        and status in ('PENDING','PROCESSING')) as present`,
        [event.event_sequence],
      );
      if (!newer.present) await this.analysis.refreshGraph();
    }
    if (event.event_type === 'DISRUPTION_CREATED') {
      const {
        rows: [d],
      } = await this.pool.query('select status,analysis_status from railway_main.disruptions where id=$1', [
        event.entity_id,
      ]);
      if (d && !['RESOLVED', 'CANCELLED'].includes(d.status) && d.analysis_status !== 'COMPLETED')
        await this.analysis.analyze(event.entity_id);
    }
  }
  async drain() {
    while (!this.stopped) {
      const event = await this.claim();
      if (!event) break;
      const heartbeat = setInterval(
        () =>
          this.pool
            .query(
              `update railway_main.event_log set locked_at=now()
        where id=$1 and lock_token=$2 and status='PROCESSING'`,
              [event.id, event.lock_token],
            )
            .catch((e) => this.logger.error('Lease heartbeat failed', e.code)),
        30000,
      );
      heartbeat.unref();
      try {
        await this.process(event);
        await this.pool.query(
          `update railway_main.event_log set status='PROCESSED',processed_at=now(),locked_at=null,
          lock_token=null,last_error=null where id=$1 and lock_token=$2`,
          [event.id, event.lock_token],
        );
      } catch (error) {
        await this.pool.query(
          `update railway_main.event_log set status=case when attempts>=5 then 'FAILED'::railway_main.event_status else 'PENDING'::railway_main.event_status end,
          available_at=now()+least(60,power(2,attempts)) * interval '1 second',locked_at=null,lock_token=null,last_error=$3
          where id=$1 and lock_token=$2`,
          [event.id, event.lock_token, String(error.code ?? error.name ?? 'ANALYSIS_FAILED').slice(0, 200)],
        );
        this.logger.error('Event processing failed', event.id, error.code ?? error.name);
      } finally {
        clearInterval(heartbeat);
      }
    }
  }
  wake() {
    if (this.stopped || this.pending) return;
    this.pending = this.drain()
      .catch((e) => this.logger.error('Outbox poll failed', e.code ?? e.name))
      .finally(() => {
        this.pending = null;
      });
  }
  async listen() {
    if (this.stopped || this.listener) return;
    try {
      const env = { ...this.env, DATABASE_LISTEN_URL: this.env.DATABASE_LISTEN_URL ?? this.env.DATABASE_URL };
      const listener = await this.listenerFactory(env, 'DATABASE_LISTEN_URL');
      if (this.stopped) {
        await listener.end();
        return;
      }
      this.listener = listener;
      listener.on('notification', () => this.wake());
      const reconnect = () => {
        if (this.listener !== listener) return;
        this.listener = null;
        listener.end().catch(() => {});
        if (!this.stopped) this.reconnectTimer = setTimeout(() => this.listen(), 2000);
      };
      listener.on('error', reconnect);
      listener.on('end', reconnect);
      await listener.query('LISTEN railway_events');
      this.wake();
    } catch (error) {
      const old = this.listener;
      this.listener = null;
      if (old) await old.end().catch(() => {});
      this.logger.error('LISTEN unavailable; polling continues', error.code ?? error.name);
      if (!this.stopped) this.reconnectTimer = setTimeout(() => this.listen(), 5000);
    }
  }
  start() {
    this.stopped = false;
    this.timer = setInterval(() => this.wake(), this.env.WORKER_POLL_MS ?? 2000);
    this.wake();
    this.listening = this.listen();
  }
  async stop() {
    this.stopped = true;
    clearInterval(this.timer);
    clearTimeout(this.reconnectTimer);
    await this.listening;
    if (this.listener) {
      const listener = this.listener;
      this.listener = null;
      await listener.end();
    }
    await this.pending;
  }
}
