-- @scope invariant
-- @check public_import_provenance
select case when count(*)=4 then 'PASS' else 'FAIL' end status,count(*) actual,
  'provenance columns and batch/rejection tables present' expected from information_schema.columns
where table_schema='railway_main' and ((table_name='stations' and column_name in ('data_source','source_record_id'))
 or (table_name='tracks' and column_name in ('data_source','source_record_id')));
-- @end
