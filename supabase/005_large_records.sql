begin;
lock table public.kaash_boards in access exclusive mode;
create table if not exists public.kaash_records (
 unit_id uuid not null references public.kaash_units(id),
 admission_key text not null,
 data jsonb not null,
 archived_at timestamptz not null default now(),
 primary key(unit_id, admission_key)
);
create index if not exists kaash_records_page on public.kaash_records(unit_id, archived_at desc, admission_key);
alter table public.kaash_records add column if not exists search_document tsvector
 generated always as (to_tsvector('simple'::regconfig,
 coalesce(data->>'name','') || ' ' || coalesce(data->>'mrn','') || ' ' ||
 coalesce(data->>'bed','') || ' ' || coalesce(data->>'diagnosis',''))) stored;
create index if not exists kaash_records_search on public.kaash_records using gin(search_document);
alter table public.kaash_records enable row level security;
drop policy if exists records_read on public.kaash_records;
create policy records_read on public.kaash_records for select to authenticated
 using(exists(select 1 from public.kaash_members m where m.user_id=auth.uid() and m.unit_id=kaash_records.unit_id and m.role<>'print_agent'));
grant select on public.kaash_records to authenticated;
create or replace function public.kaash_archive_records() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if jsonb_typeof(new.data->'archivedRecords') is distinct from 'array' then
  raise exception 'Invalid archive array';
 end if;
 insert into public.kaash_records(unit_id,admission_key,data)
 select new.unit_id, coalesce(nullif(r->>'admissionId',''),md5(r::text)),r
 from jsonb_array_elements(new.data->'archivedRecords') r
 on conflict(unit_id,admission_key) do nothing;
 new.data=jsonb_set(new.data,'{archivedRecords}','[]'::jsonb);
 return new;
end $$;
revoke all on function public.kaash_archive_records() from public, anon, authenticated;
drop trigger if exists archive_board_records on public.kaash_boards;
create trigger archive_board_records before update on public.kaash_boards
 for each row execute function public.kaash_archive_records();
-- Existing records move atomically; active patients and assignments are retained.
update public.kaash_boards set revision=revision+1
 where jsonb_array_length(data->'archivedRecords')>0;
commit;
