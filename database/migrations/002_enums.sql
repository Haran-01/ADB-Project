-- Phase 3 migration: enum types.

do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'railway_main' and t.typname = 'station_status') then
    create type railway_main.station_status as enum ('ACTIVE', 'CLOSED', 'MAINTENANCE');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'railway_main' and t.typname = 'track_status') then
    create type railway_main.track_status as enum ('ACTIVE', 'FAILED', 'MAINTENANCE', 'BLOCKED');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'railway_main' and t.typname = 'train_type') then
    create type railway_main.train_type as enum ('EXPRESS', 'PASSENGER', 'SUPERFAST', 'INTERCITY', 'FREIGHT');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'railway_main' and t.typname = 'train_status') then
    create type railway_main.train_status as enum ('SCHEDULED', 'RUNNING', 'DELAYED', 'REROUTED', 'CANCELLED');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'railway_main' and t.typname = 'journey_status') then
    create type railway_main.journey_status as enum ('SCHEDULED', 'RUNNING', 'DELAYED', 'REROUTED', 'COMPLETED', 'CANCELLED');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'railway_main' and t.typname = 'disruption_type') then
    create type railway_main.disruption_type as enum ('TRACK_FAILURE', 'ACCIDENT', 'MAINTENANCE', 'STATION_CLOSURE', 'ROUTE_BLOCKAGE');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'railway_main' and t.typname = 'disruption_severity') then
    create type railway_main.disruption_severity as enum ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'railway_main' and t.typname = 'disruption_status') then
    create type railway_main.disruption_status as enum ('OPEN', 'ANALYZING', 'RESOLVED', 'CANCELLED');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'railway_main' and t.typname = 'impact_type') then
    create type railway_main.impact_type as enum ('DIRECT_TRACK_BLOCK', 'STATION_CLOSURE', 'UPSTREAM_DELAY', 'DOWNSTREAM_DELAY', 'REGIONAL_IMPACT');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'railway_main' and t.typname = 'affected_train_status') then
    create type railway_main.affected_train_status as enum ('PENDING', 'WAITING', 'REROUTED', 'CANCELLED', 'CLEARED');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'railway_main' and t.typname = 'recommendation_status') then
    create type railway_main.recommendation_status as enum ('PROPOSED', 'ACCEPTED', 'REJECTED', 'APPLIED', 'EXPIRED');
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'railway_main' and t.typname = 'event_type') then
    create type railway_main.event_type as enum (
      'TRACK_STATUS_CHANGED',
      'DISRUPTION_CREATED',
      'DISRUPTION_ANALYSIS_REQUESTED',
      'DISRUPTION_ANALYSIS_COMPLETED',
      'ROUTE_RECOMMENDED',
      'TRAIN_STATUS_CHANGED'
    );
  end if;

  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'railway_main' and t.typname = 'event_status') then
    create type railway_main.event_status as enum ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');
  end if;
end $$;

