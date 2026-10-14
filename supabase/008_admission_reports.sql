begin;
create or replace function public.kaash_admission_date(value text) returns date
language plpgsql immutable set search_path='' as $$
declare parsed date; d integer;
begin
 value=trim(coalesce(value,''));
 if value ~ '^\d{4}-\d{2}-\d{2}$' then return value::date;
 elsif value ~ '^\d{1,2}/\d{1,2}/\d{4}$' then
  return make_date(split_part(value,'/',3)::integer,split_part(value,'/',2)::integer,split_part(value,'/',1)::integer);
 elsif value ~ '^\d{1,2} [A-Za-z]+ \d{4}$' then
  d=split_part(value,' ',1)::integer;parsed=to_date(value,'DD Month YYYY');
  if extract(day from parsed)::integer=d then return parsed;end if;
 end if;
 return null;
exception when others then return null;
end $$;
alter table public.kaash_records add column if not exists admission_date date
 generated always as (public.kaash_admission_date(data->>'doa')) stored;
alter table public.kaash_records add column if not exists report_key text
 generated always as (coalesce(nullif(data->>'admissionId',''),md5(coalesce(data->>'mrn','')||'|'||coalesce(data->>'doa','')||'|'||coalesce(data->>'toa','')))) stored;
create index if not exists kaash_records_admission_date on public.kaash_records(unit_id,admission_date);
create or replace function public.kaash_admission_report(p_unit uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.kaash_members where user_id=auth.uid() and unit_id=p_unit and role<>'print_agent') then
  raise exception 'Unit membership required' using errcode='42501';
 end if;
 with keyed as (
  select report_key as k,admission_date as date,0 as priority from public.kaash_records where unit_id=p_unit
  union all
  select coalesce(nullif(p->>'admissionId',''),md5(coalesce(p->>'mrn','')||'|'||coalesce(p->>'doa','')||'|'||coalesce(p->>'toa',''))),
   public.kaash_admission_date(p->>'doa'),1
  from public.kaash_boards b cross join lateral jsonb_array_elements(b.data->'patients') p
   where b.unit_id=p_unit and coalesce(p->>'name','')<>'' and coalesce(p->>'mrn','')<>''
 ), unique_admissions as (
  select distinct on(k) k,date from keyed order by k,priority
 ), boundaries as (
  select (now() at time zone 'Asia/Riyadh')::date as today,
   date_trunc('week',now() at time zone 'Asia/Riyadh')::date as week_start,
   date_trunc('month',now() at time zone 'Asia/Riyadh')::date as month_start
 ), counts as (
  select b.today,b.week_start,b.month_start,
   count(a.k) filter(where a.date is null) as missing_dates,
   count(*) filter(where a.date>b.today) as future_dates,
   count(*) filter(where a.date is not null and a.date<=b.today) as dated_admissions,
   min(a.date) filter(where a.date<=b.today) as earliest_date,
   count(*) filter(where a.date between b.week_start and b.today) as this_week,
   count(*) filter(where a.date>=b.week_start-7 and a.date<b.week_start) as last_week,
   count(*) filter(where a.date>=b.week_start-14 and a.date<b.week_start-7) as preceding_week,
   count(*) filter(where a.date between b.month_start and b.today) as this_month,
   count(*) filter(where a.date>=(b.month_start-interval '1 month')::date and a.date<b.month_start) as last_month,
   count(*) filter(where a.date>=(b.month_start-interval '2 months')::date and a.date<(b.month_start-interval '1 month')::date) as preceding_month
  from boundaries b left join unique_admissions a on true
  group by b.today,b.week_start,b.month_start
 )
 select jsonb_build_object('today',today,'week_start',week_start,'month_start',month_start,
  'missing_dates',missing_dates,'future_dates',future_dates,'dated_admissions',dated_admissions,'earliest_date',earliest_date,
  'this_week',this_week,'last_week',last_week,'preceding_week',preceding_week,
  'this_month',this_month,'last_month',last_month,'preceding_month',preceding_month,
  'week_change',case when preceding_week>0 then round((last_week-preceding_week)*100.0/preceding_week,1) else null end,
  'month_change',case when preceding_month>0 then round((last_month-preceding_month)*100.0/preceding_month,1) else null end)
 into result from counts;
 return result;
end $$;
revoke all on function public.kaash_admission_report(uuid) from public,anon;
grant execute on function public.kaash_admission_report(uuid) to authenticated;
commit;
