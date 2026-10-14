-- Bounded shared cache, invalidated transactionally on admission/archive changes. No patient rows deleted.
begin;
create table if not exists public.kaash_admission_report_cache(unit_id uuid primary key references public.kaash_units(id),report_day date not null,valid_until timestamptz not null,report jsonb not null);
alter table public.kaash_admission_report_cache enable row level security;
revoke all on public.kaash_admission_report_cache from public,anon,authenticated;
do $rename$ begin
 if to_regprocedure('public.kaash_admission_report_uncached(uuid)') is null then alter function public.kaash_admission_report(uuid) rename to kaash_admission_report_uncached;end if;
end $rename$;
revoke all on function public.kaash_admission_report_uncached(uuid) from public,anon,authenticated;
create or replace function public.kaash_admission_report(p_unit uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;today date:=(now() at time zone 'Asia/Riyadh')::date;
begin
 if not exists(select 1 from public.kaash_members where user_id=auth.uid() and unit_id=p_unit and role<>'print_agent') then raise exception 'Unit membership required' using errcode='42501';end if;
 select report into result from public.kaash_admission_report_cache where unit_id=p_unit and report_day=today and valid_until>now();if found then return result;end if;
 perform pg_advisory_xact_lock(hashtext('kaash-admission-report-cache'),hashtext(p_unit::text));
 select report into result from public.kaash_admission_report_cache where unit_id=p_unit and report_day=today and valid_until>now();if found then return result;end if;
 result:=public.kaash_admission_report_uncached(p_unit);
 insert into public.kaash_admission_report_cache values(p_unit,today,now()+interval '60 seconds',result)
 on conflict(unit_id) do update set report_day=excluded.report_day,valid_until=excluded.valid_until,report=excluded.report;
 return result;
end $$;
revoke all on function public.kaash_admission_report(uuid) from public,anon;
grant execute on function public.kaash_admission_report(uuid) to authenticated;
create or replace function public.kaash_drop_admission_cache(p_unit uuid) returns void language plpgsql security definer set search_path='' as $$
begin perform pg_advisory_xact_lock(hashtext('kaash-admission-report-cache'),hashtext(p_unit::text));delete from public.kaash_admission_report_cache where unit_id=p_unit;end $$;
revoke all on function public.kaash_drop_admission_cache(uuid) from public,anon,authenticated;
create or replace function public.kaash_admission_signature(board jsonb) returns jsonb language sql immutable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_array(p->>'admissionId',p->>'mrn',p->>'name',p->>'doa',p->>'toa') order by p->>'admissionId'),'[]'::jsonb) from jsonb_array_elements(board->'patients') p
$$;
revoke all on function public.kaash_admission_signature(jsonb) from public,anon,authenticated;
create or replace function public.kaash_board_report_invalidation() returns trigger language plpgsql security definer set search_path='' as $$
begin if public.kaash_admission_signature(old.data) is distinct from public.kaash_admission_signature(new.data) then perform public.kaash_drop_admission_cache(new.unit_id);end if;return new;end $$;
revoke all on function public.kaash_board_report_invalidation() from public,anon,authenticated;
drop trigger if exists invalidate_admission_report_board on public.kaash_boards;
create trigger invalidate_admission_report_board after update on public.kaash_boards for each row execute function public.kaash_board_report_invalidation();
create or replace function public.kaash_records_report_invalidation() returns trigger language plpgsql security definer set search_path='' as $$
declare unit uuid;
begin
 if tg_op='INSERT' then for unit in select distinct unit_id from new_records order by unit_id loop perform public.kaash_drop_admission_cache(unit);end loop;
 elsif tg_op='UPDATE' then for unit in select unit_id from new_records union select unit_id from old_records order by unit_id loop perform public.kaash_drop_admission_cache(unit);end loop;
 else for unit in select distinct unit_id from old_records order by unit_id loop perform public.kaash_drop_admission_cache(unit);end loop;end if;return null;
end $$;
revoke all on function public.kaash_records_report_invalidation() from public,anon,authenticated;
drop trigger if exists invalidate_admission_report_records_insert on public.kaash_records;
drop trigger if exists invalidate_admission_report_records_update on public.kaash_records;
drop trigger if exists invalidate_admission_report_records_delete on public.kaash_records;
create trigger invalidate_admission_report_records_insert after insert on public.kaash_records referencing new table as new_records for each statement execute function public.kaash_records_report_invalidation();
create trigger invalidate_admission_report_records_update after update on public.kaash_records referencing old table as old_records new table as new_records for each statement execute function public.kaash_records_report_invalidation();
create trigger invalidate_admission_report_records_delete after delete on public.kaash_records referencing old table as old_records for each statement execute function public.kaash_records_report_invalidation();
notify pgrst,'reload schema';
commit;
