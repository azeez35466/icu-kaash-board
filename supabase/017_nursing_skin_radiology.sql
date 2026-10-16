-- Narrow RPC only. STAFF does not receive direct UPDATE access to boards.
begin;
create or replace function public.kaash_nursing_access47(p_unit uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.kaash_members where unit_id=p_unit and user_id=auth.uid() and role in ('nurse','admin','doctor','charge_nurse'));
$$;
revoke all on function public.kaash_nursing_access47(uuid) from public,anon;
grant execute on function public.kaash_nursing_access47(uuid) to authenticated;

create or replace function public.kaash_save_nursing_care47(p_unit uuid,p_admission text,p_revision bigint,p_section text,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare board public.kaash_boards%rowtype; patient jsonb; pos integer; allowed text[]; row_value jsonb; updated jsonb;
begin
 if not public.kaash_nursing_access47(p_unit) then raise exception 'Nursing care permission required' using errcode='42501';end if;
 if p_section is null or p_section not in ('io','rbs','lines','therapies','blood','skin','procedures') then raise exception 'Section not permitted' using errcode='42501';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>10000 or octet_length(p_rows::text)>4000000 then raise exception 'Invalid care rows';end if;
 allowed=case p_section
 when 'skin' then array['id','time','stage','site','note','by','updatedAt']
 when 'procedures' then array['id','name','time','stage','note','by','added','date','updatedAt']
 when 'io' then array['id','time','kind','source','ml','note','updatedAt']
 when 'rbs' then array['id','time','rbs','rbsUnit','note','updatedAt']
 when 'lines' then array['id','name','stage','site','size','insertedAt','expiry','by','note','updatedAt']
 when 'therapies' then array['id','kind','name','concentration','rate','access','prepared','expiry','by','status','createdAt','stoppedAt','updatedAt']
 when 'blood' then array['id','status','component','units','abo','time','expiry','note','updatedAt'] end;
 for row_value in select value from jsonb_array_elements(p_rows) loop
  if jsonb_typeof(row_value) is distinct from 'object' then raise exception 'Invalid care entry';end if;
  if exists(select 1 from jsonb_each(row_value) where not(key=any(allowed)) or jsonb_typeof(value) not in ('string','number','null') or length(value#>>'{}')>1000) then raise exception 'Care entry contains unsupported fields';end if;
  if p_section in ('io','rbs','blood') and (coalesce(row_value->>'time','')!~'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}' or length(row_value->>'time')>32) then raise exception 'Actual time required';end if;
  if p_section='io' and (coalesce(row_value->>'kind','') not in ('Intake','Output') or coalesce(row_value->>'source','')='' or coalesce(row_value->>'ml','')!~'^\d+(\.\d+)?$') then raise exception 'Invalid fluid entry';end if;
  if p_section='rbs' and (coalesce(row_value->>'rbs','')!~'^\d+(\.\d+)?$' or coalesce(row_value->>'rbsUnit','') not in ('mg/dL','mmol/L')) then raise exception 'Invalid RBS entry';end if;
  if p_section='rbs' and (row_value->>'rbs')::numeric<=0 then raise exception 'Positive RBS required';end if;
  if p_section='blood' and (coalesce(row_value->>'status','') not in ('Given','Standby','Cancelled') or coalesce(row_value->>'component','')='' or coalesce(row_value->>'units','')!~'^[1-9]\d*$') then raise exception 'Invalid blood entry';end if;
  if p_section='skin' and (coalesce(row_value->>'time','')!~'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}' or coalesce(row_value->>'stage','')='' or coalesce(row_value->>'by','')='') then raise exception 'Assessment time, stage and practitioner required';end if;
  if p_section='procedures' and (coalesce(row_value->>'name','')='' or coalesce(row_value->>'stage','')='') then raise exception 'Procedure and status required';end if;
  if p_section='lines' and (coalesce(row_value->>'name','')='' or coalesce(row_value->>'stage','')='') then raise exception 'Device and status required';end if;
  if p_section='therapies' and (coalesce(row_value->>'name','')='' or coalesce(row_value->>'rate','')='' or coalesce(row_value->>'prepared','')='' or coalesce(row_value->>'by','')='') then raise exception 'Verified therapy details required';end if;
 end loop;
 select * into board from public.kaash_boards where unit_id=p_unit for update;
 if not found then raise exception 'Unit unavailable';end if;
 if board.revision is distinct from p_revision then raise exception 'Board changed. Reload latest data before saving; your form is preserved.' using errcode='40001';end if;
 select value,ordinality::integer-1 into patient,pos from jsonb_array_elements(board.data->'patients') with ordinality where value->>'admissionId'=p_admission;
 if patient is null or coalesce(patient->>'status','')<>'' then raise exception 'Active admission unavailable';end if;
 -- Construct only the permitted subtree. No submitted identity/admission is used.
 if p_section in ('io','rbs','skin') then patient=jsonb_set(patient,'{nursing39}',coalesce(patient->'nursing39','{}'::jsonb)||jsonb_build_object(p_section,p_rows));
 elsif p_section='blood' then patient=jsonb_set(patient,'{clinical9}',coalesce(patient->'clinical9','{}'::jsonb)||jsonb_build_object('blood',p_rows));
 else patient=jsonb_set(patient,array[p_section],p_rows);end if;
 updated=jsonb_set(board.data,array['patients',pos::text],patient);
 update public.kaash_boards set data=updated,revision=board.revision+1 where unit_id=p_unit returning data into updated;
 return jsonb_build_object('data',updated,'revision',board.revision+1);
end $$;
revoke all on function public.kaash_save_nursing_care47(uuid,text,bigint,text,jsonb) from public,anon;
grant execute on function public.kaash_save_nursing_care47(uuid,text,bigint,text,jsonb) to authenticated;
commit;
