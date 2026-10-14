begin;
create or replace function public.kaash_backup_manifest(p_unit uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.kaash_members where user_id=auth.uid() and unit_id=p_unit and role='admin') then
  raise exception 'Administrator role required for unit backup' using errcode='42501';
 end if;
 return (
  select jsonb_build_object(
   'format','ICU-KAASH-UNIT-SNAPSHOT','version',1,'unit_id',p_unit,'unit_name',u.name,
   'captured_at',now(),'revision',b.revision,'board',b.data,
   'records_count',(select count(*) from public.kaash_records where unit_id=p_unit),
   'audit_count',(select count(*) from public.kaash_change_history where unit_id=p_unit),
   'linen_moves_count',(select count(*) from public.kaash_linen_moves where unit_id=p_unit),
   'linen_stock',coalesce((select jsonb_agg(to_jsonb(s) order by s.item) from public.kaash_linen_stock s where s.unit_id=p_unit),'[]'::jsonb)
  ) from public.kaash_units u join public.kaash_boards b on b.unit_id=u.id where u.id=p_unit
 );
end $$;
revoke all on function public.kaash_backup_manifest(uuid) from public,anon;
grant execute on function public.kaash_backup_manifest(uuid) to authenticated;
commit;
