begin;
create table if not exists public.kaash_change_history (
 unit_id uuid not null references public.kaash_units(id),
 revision bigint not null,
 actor uuid,
 actor_name text not null,
 at timestamptz not null default now(),
 changes jsonb not null,
 patient_context jsonb not null default '{}',
 primary key(unit_id,revision)
);
alter table public.kaash_change_history add column if not exists patient_context jsonb not null default '{}';
alter table public.kaash_change_history enable row level security;
create index if not exists kaash_change_history_date on public.kaash_change_history(unit_id,at desc);
drop policy if exists history_editors_read on public.kaash_change_history;
create policy history_editors_read on public.kaash_change_history for select to authenticated
using(exists(select 1 from public.kaash_members m where m.user_id=auth.uid()
 and m.unit_id=kaash_change_history.unit_id and m.role in ('admin','charge_nurse')));
grant select on public.kaash_change_history to authenticated;
create or replace function public.kaash_json_changes(old_value jsonb,new_value jsonb,field_path text default '')
returns jsonb language plpgsql immutable set search_path='' as $$
declare result jsonb='[]'::jsonb; k text; i integer; n integer;
begin
 if old_value is not distinct from new_value then return result;end if;
 if jsonb_typeof(old_value)='object' and jsonb_typeof(new_value)='object' then
  for k in select key from jsonb_object_keys(old_value) key union select key from jsonb_object_keys(new_value) key loop
   result=result||public.kaash_json_changes(old_value->k,new_value->k,field_path||'/'||replace(replace(k,'~','~0'),'/','~1'));
  end loop;
 elsif jsonb_typeof(old_value)='array' and jsonb_typeof(new_value)='array' then
  n=greatest(jsonb_array_length(old_value),jsonb_array_length(new_value));
  if n>0 then for i in 0..n-1 loop result=result||public.kaash_json_changes(old_value->i,new_value->i,field_path||'/'||i);end loop;end if;
 else
  result=jsonb_build_array(jsonb_build_object('path',field_path,'before',old_value,'after',new_value));
 end if;
 return result;
end $$;
revoke all on function public.kaash_json_changes(jsonb,jsonb,text) from public,anon,authenticated;
create or replace function public.kaash_task_completion_times() returns trigger
language plpgsql security definer set search_path='' as $$
declare old_patients jsonb;old_tasks jsonb;patient jsonb;task jsonb;previous_task jsonb;tasks jsonb;normalized jsonb;field_name text;
begin
 select coalesce(jsonb_object_agg(coalesce(p->>'admissionId',md5(p::text)),p),'{}'::jsonb)
 into old_patients from jsonb_array_elements(old.data->'patients') p;
 for field_name in select unnest(array['patients','archivedRecords']) loop
 normalized='[]'::jsonb;
 for patient in select value from jsonb_array_elements(new.data->field_name) loop
  if field_name='archivedRecords' and not coalesce(old_patients ? (patient->>'admissionId'),false) then
   normalized=normalized||jsonb_build_array(patient);continue;
  end if;
  if jsonb_typeof(patient->'tasks') is not null and jsonb_typeof(patient->'tasks')<>'array' then raise exception 'Tasks must be an array';end if;
  select coalesce(jsonb_object_agg(t->>'id',t),'{}'::jsonb) into old_tasks
  from jsonb_array_elements(case when jsonb_typeof(old_patients->(patient->>'admissionId')->'tasks')='array'
   then old_patients->(patient->>'admissionId')->'tasks' else '[]'::jsonb end) t
  where coalesce(t->>'id','')<>'';
  tasks='[]'::jsonb;
  for task in select value from jsonb_array_elements(coalesce(patient->'tasks','[]'::jsonb)) loop
   if jsonb_typeof(task)<>'object' then raise exception 'Invalid task record';end if;
   previous_task=old_tasks->(task->>'id');
   if coalesce(task->>'id','')='' or task->>'status' is distinct from 'Completed' then
    task=task-'completedAt'-'dueAtCompletion';
   elsif previous_task->>'status' is distinct from 'Completed' then
    task=task||jsonb_build_object('completedAt',now(),'dueAtCompletion',task->'due');
   else
    task=task-'completedAt'-'dueAtCompletion';
    if previous_task ? 'completedAt' then task=task||jsonb_build_object('completedAt',previous_task->'completedAt');end if;
    if previous_task ? 'dueAtCompletion' then task=task||jsonb_build_object('dueAtCompletion',previous_task->'dueAtCompletion');end if;
   end if;
   tasks=tasks||jsonb_build_array(task);
  end loop;
  normalized=normalized||jsonb_build_array(patient||jsonb_build_object('tasks',tasks));
 end loop;
 new.data=jsonb_set(new.data,array[field_name],normalized);
 end loop;
 return new;
end $$;
revoke all on function public.kaash_task_completion_times() from public,anon,authenticated;
drop trigger if exists completion_times_board on public.kaash_boards;
drop trigger if exists a_completion_times_board on public.kaash_boards;
create trigger a_completion_times_board before update on public.kaash_boards
for each row execute function public.kaash_task_completion_times();
create or replace function public.kaash_record_changes() returns trigger
language plpgsql security definer set search_path='' as $$
declare before_view jsonb;after_view jsonb;before_patients jsonb;after_patients jsonb;diff jsonb;actor_label text;context jsonb;
begin
 select coalesce(jsonb_object_agg(coalesce(nullif(p->>'admissionId',''),md5(p::text)),p),'{}'::jsonb) into before_patients from jsonb_array_elements(old.data->'patients') p;
 select coalesce(jsonb_object_agg(coalesce(nullif(p->>'admissionId',''),md5(p::text)),p),'{}'::jsonb) into after_patients from jsonb_array_elements(new.data->'patients') p;
 before_view=(old.data-'patients'-'archivedRecords')||jsonb_build_object('patients',before_patients);
 after_view=(new.data-'patients'-'archivedRecords')||jsonb_build_object('patients',after_patients);
 diff=public.kaash_json_changes(before_view,after_view);
 if jsonb_array_length(diff)>0 then
  select email into actor_label from auth.users where id=auth.uid();
  select coalesce(jsonb_object_agg(key,jsonb_build_object('name',value->>'name','mrn',value->>'mrn','bed',value->>'bed')),'{}'::jsonb)
  into context from jsonb_each(before_patients||after_patients)
  where exists(select 1 from jsonb_array_elements(diff) change
   where change->>'path'='/patients/'||replace(replace(key,'~','~0'),'/','~1')
   or starts_with(change->>'path','/patients/'||replace(replace(key,'~','~0'),'/','~1')||'/'));
  insert into public.kaash_change_history(unit_id,revision,actor,actor_name,changes,patient_context)
  values(new.unit_id,new.revision,auth.uid(),coalesce(actor_label,'System / database operation'),diff,context);
 end if;
 return new;
end $$;
revoke all on function public.kaash_record_changes() from public,anon,authenticated;
drop trigger if exists record_board_changes on public.kaash_boards;
create trigger record_board_changes after update on public.kaash_boards
for each row when(old.data is distinct from new.data) execute function public.kaash_record_changes();
commit;
