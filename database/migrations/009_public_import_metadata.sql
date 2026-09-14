-- Phase 16 provenance and repeatable public-data imports.
alter table railway_main.stations add column data_source text not null default 'HANDCRAFTED',
  add column source_record_id text;
alter table railway_main.tracks add column data_source text not null default 'HANDCRAFTED',
  add column source_record_id text;
create unique index idx_stations_source_record on railway_main.stations(data_source,source_record_id)
  where source_record_id is not null;
create unique index idx_tracks_source_record on railway_main.tracks(data_source,source_record_id)
  where source_record_id is not null;
create table railway_main.import_batches (
  id uuid primary key default extensions.gen_random_uuid(),source_name text not null,source_url text,
  source_license text not null,source_checksum text not null unique,status text not null
    check(status in ('RUNNING','COMPLETED','FAILED')),
  stations_imported integer not null default 0,tracks_imported integer not null default 0,
  trains_imported integer not null default 0,started_at timestamptz not null default now(),completed_at timestamptz,
  error_summary text
);
create table railway_main.import_rejections (
  id uuid primary key default extensions.gen_random_uuid(),batch_id uuid not null references railway_main.import_batches(id) on delete cascade,
  record_type text not null,source_record_id text,reason text not null,payload jsonb not null,created_at timestamptz not null default now()
);
alter table railway_main.import_batches enable row level security;
alter table railway_main.import_rejections enable row level security;
create policy railway_server_access on railway_main.import_batches to railway_app using(true) with check(true);
create policy railway_server_access on railway_main.import_rejections to railway_app using(true) with check(true);
grant select,insert,update,delete on railway_main.import_batches,railway_main.import_rejections to railway_app;
