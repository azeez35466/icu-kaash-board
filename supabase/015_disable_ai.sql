begin;
-- Stop AI calls even from older immutable deployments. No patient or usage rows changed.
create or replace function public.kaash_assistant_quota(p_unit uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.kaash_members where user_id=auth.uid() and unit_id=p_unit and role in ('admin','doctor','charge_nurse','nurse','pct')) then raise exception 'Unit membership required' using errcode='42501';end if;
 return jsonb_build_object('allowed',false,'disabled',true);
end $$;
revoke all on function public.kaash_assistant_quota(uuid) from public,anon;
grant execute on function public.kaash_assistant_quota(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
