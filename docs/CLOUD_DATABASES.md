# Cloud Database Setup

This project uses managed databases instead of local Docker containers.

## Managed Services

### PostgreSQL and PostGIS - Supabase

Supabase provides hosted PostgreSQL. It supports PostgreSQL extensions, including PostGIS and `postgres_fdw`, from the database dashboard or SQL editor.

Use Supabase as the authoritative database for:

- relational data.
- temporal data.
- history tables.
- triggers.
- SQL functions and procedures.
- PostGIS spatial queries.
- event tables and notifications.

PostgreSQL remains the single source of truth.

### Neo4j - Neo4j Aura

Neo4j Aura provides managed Neo4j in the cloud. Use it only as a read-optimized routing projection.

Rules:

- Do not manually insert railway business data into Neo4j.
- Do not update railway data directly inside Neo4j.
- Rebuild Neo4j nodes and relationships from PostgreSQL using sync scripts.
- Store routing-friendly copies of station and track data only.

## Recommended Cloud Architecture

```text
Supabase PostgreSQL/PostGIS
  |
  | source-of-truth data
  | SQL functions, triggers, views, history
  v
Sync Script
  |
  | station and track projection
  v
Neo4j Aura

Backend APIs connect to both:
  - Supabase PostgreSQL for authoritative data and SQL-first business logic.
  - Neo4j Aura for alternate path search.
```

## Supabase Setup

1. Create a Supabase project.
2. Open Project Settings -> Database and copy the connection string.
3. Set `DATABASE_URL` and `DATABASE_LISTEN_URL` in `backend/.env`. Use the direct host if IPv6 is available; otherwise copy the **session pooler** string from Connect. Use port 5432 for the session pooler. Do not use a transaction pooler for LISTEN or migration session locks.
4. Enable PostGIS.

Recommended SQL:

```sql
create extension if not exists postgis with schema extensions;
```

For the distributed database demonstration, begin with regional schemas in the same Supabase project:

```sql
create schema if not exists railway_main;
create schema if not exists railway_north;
create schema if not exists railway_central;
create schema if not exists railway_south;
```

This is the best MVP approach because it avoids cross-project networking issues while still demonstrating logical distribution. Later, this can be upgraded to separate Supabase projects or separate PostgreSQL databases using `postgres_fdw`.

## Neo4j Aura Setup

1. Create a Neo4j AuraDB instance.
2. Copy the connection URI, username, and generated password.
3. Set these values in `backend/.env`, using the exact username and database from the downloaded credentials (they may be instance-specific):

```text
NEO4J_URI=neo4j+s://your-instance.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_generated_password
NEO4J_DATABASE=your_database_name
```

## Environment Variables

Use `.env.example` as the template.

Required values:

```text
DATABASE_URL=postgresql://postgres.your-project-ref:[ENCODED_PASSWORD]@[SESSION_POOLER_HOST]:5432/postgres
DATABASE_LISTEN_URL=postgresql://postgres.your-project-ref:[ENCODED_PASSWORD]@[SESSION_POOLER_HOST]:5432/postgres
DATABASE_SSL_MODE=verify-full

NEO4J_URI=neo4j+s://your-instance.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_generated_password
```

The implementation connects through PostgreSQL; Supabase anon/service-role API keys are not required. Never expose database or service-role credentials in frontend code. TLS verification is enabled by default; use `DATABASE_CA_FILE` for the provider CA if necessary. Use the schema owner for migration/application scripts, then provision a separate backend login with membership in `railway_app` for runtime.

## Verification

Verification is available through SQL clients, Supabase SQL editor, and `/api/health/db` and `/api/health/neo4j`. See `PHASES_7_12_VERIFICATION.md` for current evidence.

### Verify Supabase PostgreSQL

Run in Supabase SQL editor:

```sql
select current_database(), current_user;
```

### Verify PostGIS

Run in Supabase SQL editor:

```sql
select postgis_full_version();
```

### Verify Regional Schemas

Run in Supabase SQL editor:

```sql
select schema_name
from information_schema.schemata
where schema_name in (
  'railway_main',
  'railway_north',
  'railway_central',
  'railway_south'
)
order by schema_name;
```

### Verify Neo4j Aura

Run in Neo4j Browser:

```cypher
RETURN 1 AS ok;
```

## Phase 1 Verification Status

Docker has been removed from this project by choice. Phase 1 is complete when:

- Supabase project exists.
- Supabase connection string is available.
- PostGIS is enabled.
- regional schemas are created or planned for Phase 3.
- Neo4j Aura instance exists.
- Neo4j connection credentials are available.
- `.env` can be created from `.env.example`.
