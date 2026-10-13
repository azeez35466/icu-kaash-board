-- Install in a NEW test Supabase project. This is not a migration for Oasis.
begin;
create table public.kaash_units(id uuid primary key default gen_random_uuid(),name text not null);
create table public.kaash_members(user_id uuid references auth.users(id),unit_id uuid references public.kaash_units(id),role text not null check(role in ('admin','doctor','charge_nurse','nurse','pct','print_agent')),bridge_id text,primary key(user_id,unit_id));
alter table public.kaash_units enable row level security;
alter table public.kaash_members enable row level security;
create policy own_membership on public.kaash_members for select to authenticated using(user_id=auth.uid());
create policy member_units on public.kaash_units for select to authenticated using(exists(select 1 from public.kaash_members m where m.user_id=auth.uid() and m.unit_id=id));
create table public.kaash_boards(unit_id uuid primary key references public.kaash_units(id),data jsonb not null default '{"patients":[],"archivedRecords":[]}',revision bigint not null default 1,updated_at timestamptz not null default now(),updated_by uuid);
alter table public.kaash_boards enable row level security;
create policy board_read on public.kaash_boards for select to authenticated using(exists(select 1 from public.kaash_members m where m.user_id=auth.uid() and m.unit_id=kaash_boards.unit_id and m.role<>'print_agent'));
create policy board_update on public.kaash_boards for update to authenticated using(exists(select 1 from public.kaash_members m where m.user_id=auth.uid() and m.unit_id=kaash_boards.unit_id and m.role in ('admin','doctor','charge_nurse'))) with check(exists(select 1 from public.kaash_members m where m.user_id=auth.uid() and m.unit_id=kaash_boards.unit_id and m.role in ('admin','doctor','charge_nurse')));
create table public.kaash_audit(id bigint generated always as identity primary key,unit_id uuid not null,actor uuid,at timestamptz not null default now(),revision bigint not null,event text not null);
alter table public.kaash_audit enable row level security;
create policy audit_admin_read on public.kaash_audit for select to authenticated using(exists(select 1 from public.kaash_members m where m.user_id=auth.uid() and m.unit_id=kaash_audit.unit_id and m.role='admin'));
create function public.kaash_board_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.unit_id<>old.unit_id or new.revision<>old.revision+1 then raise exception 'Invalid revision or unit'; end if;
 if jsonb_typeof(new.data->'patients') is distinct from 'array' or jsonb_typeof(new.data->'archivedRecords') is distinct from 'array' then raise exception 'Invalid board'; end if;
 if exists(select 1 from jsonb_array_elements(new.data->'patients') p where coalesce(p->>'name','')='' or coalesce(p->>'mrn','')='' or coalesce(p->>'admissionId','')='') then raise exception 'Patient identity required';end if;
 if exists(select 1 from jsonb_array_elements(new.data->'patients') p group by p->>'bed' having count(*)>1) then raise exception 'Duplicate occupied bed';end if;
 new.updated_at=now();new.updated_by=auth.uid();
 insert into public.kaash_audit(unit_id,actor,revision,event) values(new.unit_id,auth.uid(),new.revision,'board_updated');
 return new;
end $$;
create trigger guard_board before update on public.kaash_boards for each row execute function public.kaash_board_guard();
create table public.kaash_printers(id uuid primary key default gen_random_uuid(),unit_id uuid references public.kaash_units(id),name text not null,model text not null check(model in ('ZD420','ZD421')),bridge_id text not null,host inet not null,port integer not null default 9100 check(port=9100),dpi integer not null default 203 check(dpi=203),width_mm numeric not null check(width_mm between 25 and 104),height_mm numeric not null check(height_mm between 25 and 150),gap_mm numeric not null default 2 check(gap_mm between 0 and 10),enabled boolean not null default false);
alter table public.kaash_printers enable row level security;
create policy printers_read on public.kaash_printers for select to authenticated using(exists(select 1 from public.kaash_members m where m.user_id=auth.uid() and m.unit_id=kaash_printers.unit_id and (m.role<>'print_agent' or m.bridge_id=kaash_printers.bridge_id)));
create table public.kaash_print_jobs(id uuid primary key,unit_id uuid references public.kaash_units(id),printer_id uuid references public.kaash_printers(id),created_by uuid not null default auth.uid(),created_at timestamptz not null default now(),payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=16384),status text not null default 'pending' check(status in ('pending','processing','sent','failed','unknown')),status_note text,claimed_at timestamptz,finished_at timestamptz);
alter table public.kaash_print_jobs enable row level security;
create policy print_create on public.kaash_print_jobs for insert to authenticated with check(created_by=auth.uid() and status='pending' and claimed_at is null and finished_at is null and exists(select 1 from public.kaash_members m join public.kaash_printers p on p.unit_id=m.unit_id where m.user_id=auth.uid() and m.unit_id=kaash_print_jobs.unit_id and m.role in ('admin','doctor','charge_nurse','nurse') and p.id=kaash_print_jobs.printer_id and p.enabled));
create policy print_read on public.kaash_print_jobs for select to authenticated using(created_by=auth.uid() or exists(select 1 from public.kaash_members m where m.user_id=auth.uid() and m.unit_id=kaash_print_jobs.unit_id and m.role='admin'));
create function public.kaash_claim_print_job() returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.kaash_print_jobs; p public.kaash_printers;
begin
 select jobs.* into j from public.kaash_print_jobs jobs join public.kaash_printers pr on pr.id=jobs.printer_id join public.kaash_members m on m.unit_id=jobs.unit_id and m.user_id=auth.uid() where m.role='print_agent' and m.bridge_id=pr.bridge_id and pr.enabled and jobs.status='pending' order by jobs.created_at for update of jobs skip locked limit 1;
 if not found then return null;end if;
 update public.kaash_print_jobs set status='processing',claimed_at=now() where id=j.id;
 select * into p from public.kaash_printers where id=j.printer_id;
 return jsonb_build_object('job',to_jsonb(j),'printer',to_jsonb(p));
end $$;
create function public.kaash_finish_print_job(job_id uuid,result text,note text) returns void language plpgsql security definer set search_path='' as $$
begin
 if result not in ('sent','failed','unknown') then raise exception 'Invalid status';end if;
 update public.kaash_print_jobs j set status=result,status_note=left(note,200),finished_at=now() from public.kaash_printers p,public.kaash_members m where j.id=job_id and j.status='processing' and p.id=j.printer_id and m.user_id=auth.uid() and m.unit_id=j.unit_id and m.role='print_agent' and m.bridge_id=p.bridge_id;
 if not found then raise exception 'Job unavailable';end if;
end $$;
revoke all on function public.kaash_claim_print_job(),public.kaash_finish_print_job(uuid,text,text) from public,anon;
grant execute on function public.kaash_claim_print_job(),public.kaash_finish_print_job(uuid,text,text) to authenticated;
commit;
