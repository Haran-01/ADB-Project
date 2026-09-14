-- No login or password is created. Grant membership to a separately provisioned backend login.
do $$ begin
  if not exists(select 1 from pg_roles where rolname='railway_app') then create role railway_app nologin; end if;
end $$;
grant usage on schema railway_main,extensions to railway_app;
grant select,insert,update,delete on all tables in schema railway_main to railway_app;
grant usage,select on all sequences in schema railway_main to railway_app;
revoke insert,update,delete on railway_main.schema_migrations,railway_main.logic_artifacts from railway_app;
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname='railway_main' loop
    execute format('create policy railway_server_access on railway_main.%I to railway_app using (true) with check (true)',t.tablename);
  end loop;
end $$;
alter default privileges in schema railway_main grant select,insert,update,delete on tables to railway_app;
alter default privileges in schema railway_main grant usage,select on sequences to railway_app;
alter default privileges in schema railway_main grant execute on functions to railway_app;
