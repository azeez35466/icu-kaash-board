begin;
grant usage on schema public to authenticated;
grant select on public.kaash_units, public.kaash_members, public.kaash_boards,
 public.kaash_printers, public.kaash_records to authenticated;
grant update (data, revision) on public.kaash_boards to authenticated;
grant select, insert on public.kaash_print_jobs to authenticated;
grant select on public.kaash_audit to authenticated;
-- STAFF is view-only. Print queue creation is limited to editing roles.
drop policy if exists print_create on public.kaash_print_jobs;
create policy print_create on public.kaash_print_jobs for insert to authenticated
with check(created_by=auth.uid() and status='pending' and claimed_at is null and finished_at is null
 and exists(select 1 from public.kaash_members m join public.kaash_printers p on p.unit_id=m.unit_id
 where m.user_id=auth.uid() and m.unit_id=kaash_print_jobs.unit_id
 and m.role in ('admin','doctor','charge_nurse')
 and p.id=kaash_print_jobs.printer_id and p.enabled));
commit;
