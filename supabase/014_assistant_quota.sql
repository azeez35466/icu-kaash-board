begin;
create table if not exists public.kaash_assistant_usage(unit_id uuid references public.kaash_units(id),usage_day date,requests integer not null default 0,by_user jsonb not null default '{}',primary key(unit_id,usage_day));
alter table public.kaash_assistant_usage enable row level security;
revoke all on public.kaash_assistant_usage from public,anon,authenticated;
create or replace function public.kaash_assistant_quota(p_unit uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare today date:=(now() at time zone 'Asia/Riyadh')::date;actor text:=auth.uid()::text;total integer;personal integer;
begin
 if actor is null or not exists(select 1 from public.kaash_members where user_id=auth.uid() and unit_id=p_unit and role in ('admin','doctor','charge_nurse','nurse','pct')) then raise exception 'Unit membership required' using errcode='42501';end if;
 insert into public.kaash_assistant_usage(unit_id,usage_day) values(p_unit,today) on conflict do nothing;
 select requests,coalesce((by_user->>actor)::integer,0) into total,personal from public.kaash_assistant_usage where unit_id=p_unit and usage_day=today for update;
 if total>=200 or personal>=20 then return jsonb_build_object('allowed',false);end if;
 update public.kaash_assistant_usage set requests=requests+1,by_user=jsonb_set(by_user,array[actor],to_jsonb(personal+1)) where unit_id=p_unit and usage_day=today;
 return jsonb_build_object('allowed',true);
end $$;
revoke all on function public.kaash_assistant_quota(uuid) from public,anon;
grant execute on function public.kaash_assistant_quota(uuid) to authenticated;
-- Compute inside PostgreSQL. The application server receives counts, never the patient board.
create or replace function public.kaash_assistant_statistics(p_unit uuid,p_shift text) returns jsonb language plpgsql security definer set search_path='' as $$
declare b jsonb;rev bigint;today text:=to_char(now() at time zone 'Asia/Riyadh','YYYY-MM-DD');month text:=left(today,7);p jsonb;t jsonb;h jsonb;last_h jsonb;assignments jsonb;loads jsonb:='{}';staff jsonb:='{}';dates jsonb;date_key text;row jsonb;period text;person text;state jsonb;recorded boolean;rn text;occupied integer:=0;missing integer:=0;unassigned integer:=0;pending integer:=0;overdue integer:=0;unreceived integer:=0;oncall integer:=0;recorded_days integer:=0;due timestamptz;
begin
 if not exists(select 1 from public.kaash_members where user_id=auth.uid() and unit_id=p_unit and role in ('admin','doctor','charge_nurse','nurse','pct')) then raise exception 'Unit membership required' using errcode='42501';end if;
 if p_shift is null or p_shift not in ('Day','Evening','Night') then raise exception 'Invalid shift';end if;
 select data,revision into b,rev from public.kaash_boards where unit_id=p_unit;if not found then raise exception 'Unit board unavailable';end if;
 assignments:=case when b->>'scheduleDate'=today then b->'shiftRNs'->p_shift else b->'scheduleByDate4'->today->'rn'->p_shift end;
 for p in select value from jsonb_array_elements(coalesce(b->'patients','[]')) loop
  if nullif(trim(p->>'name'),'') is null or nullif(trim(p->>'mrn'),'') is null or coalesce(p->>'status','')<>'' then continue;end if;
  occupied:=occupied+1;if nullif(trim(p->>'diagnosis'),'') is null or nullif(trim(p->>'doa'),'') is null then missing:=missing+1;end if;
  rn:=nullif(trim(assignments->>(p->>'bed')),'');if rn is null then unassigned:=unassigned+1;else loads:=jsonb_set(loads,array[rn],'true');end if;
  for t in select value from jsonb_array_elements(coalesce(p->'tasks','[]')) loop
   if t->>'status'='Completed' then continue;end if;pending:=pending+1;
   due:=public.kaash_timestamp_or_null(case when t->>'due' ~ '(Z|[+-]\d{2}:\d{2})$' then t->>'due' else (t->>'due')||'+03:00' end);if due<now() then overdue:=overdue+1;end if;
  end loop;
  last_h:=null;for h in select value from jsonb_array_elements(coalesce(p->'handovers','[]')) loop
   if h->>'shift'=p_shift and to_char(public.kaash_timestamp_or_null(h->>'createdAt') at time zone 'Asia/Riyadh','YYYY-MM-DD')=today then last_h:=h;end if;
  end loop;if last_h is not null and nullif(last_h->>'receivedAt','') is null then unreceived:=unreceived+1;end if;
 end loop;
 dates:=coalesce(b->'scheduleByDate4','{}');if nullif(b->>'scheduleDate','') is not null then dates:=jsonb_set(dates,array[b->>'scheduleDate'],jsonb_build_object('attendance',coalesce(b->'shiftAttendance','{}')));end if;
 for date_key,row in select key,value from jsonb_each(dates) loop
  if left(date_key,7)<>month or public.kaash_admission_date(date_key) is null then continue;end if;recorded:=false;
  foreach period in array array['Day','Evening','Night'] loop
   for person,state in select key,value from jsonb_each(coalesce(row->'attendance'->period,'{}')) loop
    if nullif(trim(person),'') is null or state='null'::jsonb or state='""'::jsonb then continue;end if;recorded:=true;if state='"On-call"'::jsonb then oncall:=oncall+1;staff:=jsonb_set(staff,array[person],'true');end if;
   end loop;
  end loop;if recorded then recorded_days:=recorded_days+1;end if;
 end loop;
 return jsonb_build_object('capturedAt',now(),'revision',rev,'date',today,'shift',p_shift,'capacity',28,'occupied',occupied,'available',greatest(0,28-occupied),'occupancyPercent',round(occupied*100.0/28,1),'patientsMissingDiagnosisOrAdmissionDate',missing,'bedsWithoutRN',unassigned,'assignedRNs',(select count(*) from jsonb_object_keys(loads)),'pendingTasks',pending,'overdueTasks',overdue,'handoversAwaitingReceipt',unreceived,'oncall',jsonb_build_object('month',month,'recordedShifts',oncall,'staffCount',(select count(*) from jsonb_object_keys(staff)),'recordedDays',recorded_days),'admissions',public.kaash_admission_report(p_unit));
end $$;
revoke all on function public.kaash_assistant_statistics(uuid,text) from public,anon;
grant execute on function public.kaash_assistant_statistics(uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
