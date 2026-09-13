-- Phase 3 migration: extensions and schemas.
-- PostgreSQL/Supabase remains the source of truth.

create schema if not exists extensions;
create schema if not exists railway_main;
create schema if not exists railway_north;
create schema if not exists railway_central;
create schema if not exists railway_south;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists postgis with schema extensions;

create table if not exists railway_main.schema_migrations (
  id bigserial primary key,
  filename text not null unique,
  checksum text not null,
  applied_at timestamptz not null default now()
);

