begin;
create or replace function public.kaash_timestamp_or_null(value text) returns timestamptz
language plpgsql immutable set search_path='' as $$
begin
 if value ~ '^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$' then return value::timestamptz;end if;
 return null;
exception when others then return null;
end $$;
create or replace function public.kaash_admitted_time(p jsonb) returns timestamptz
language plpgsql immutable set search_path='' as $$
declare d date;t text;
begin
 d=public.kaash_admission_date(p->>'doa');t=p->>'toa';
 if d is not null and t ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' then
  return (d::text||'T'||t||'+03:00')::timestamptz;
 end if;
 return null;
exception when others then return null;
end $$;
create or replace function public.kaash_care_quality_report(p_unit uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.kaash_members where user_id=auth.uid() and unit_id=p_unit and role<>'print_agent') then
  raise exception 'Unit membership required' using errcode='42501';
 end if;
 with bounds as (
  select date_trunc('month',now() at time zone 'Asia/Riyadh')::date as month_start,
   (date_trunc('month',now() at time zone 'Asia/Riyadh')-interval '1 month')::date as period_start
 ), archived as (
  select distinct on(report_key) report_key as k,lower(trim(data->>'mrn')) as mrn,
   lower(trim(coalesce(data->>'dischargeType',''))) as disposition,
   public.kaash_admitted_time(data) as admitted,
   public.kaash_timestamp_or_null(data->>'dischargedAtISO') as discharged,
   coalesce((public.kaash_timestamp_or_null(data->>'dischargedAtISO') at time zone 'Asia/Riyadh')::date,
    public.kaash_admission_date(data->>'dischargedAt')) as discharge_date
  from public.kaash_records where unit_id=p_unit order by report_key,archived_at desc
 ), admissions as (
  select k,mrn,admitted from archived
  union all
  select p->>'admissionId',lower(trim(p->>'mrn')),public.kaash_admitted_time(p)
  from public.kaash_boards b cross join lateral jsonb_array_elements(b.data->'patients') p where b.unit_id=p_unit
 ), cohort as (
  select a.* from archived a cross join bounds b where a.discharge_date>=b.period_start and a.discharge_date<b.month_start
 ), stats as (
  select count(*) filter(where admitted is not null and discharged is not null and discharged>=admitted) as duration_count,
   count(*) filter(where admitted is null or discharged is null or discharged<admitted) as missing_duration,
   round(avg(extract(epoch from(discharged-admitted))/86400.0) filter(where admitted is not null and discharged is not null and discharged>=admitted),2) as mean_stay_days
  from cohort
 ), followup as (
  select c.*,
   exists(select 1 from admissions a where a.k is distinct from c.k and a.mrn=c.mrn and a.admitted>c.discharged and a.admitted<=c.discharged+interval '30 days') as returned
  from cohort c where c.discharged is not null and c.mrn<>'' and c.discharged<=now()-interval '30 days'
   and c.disposition not in ('expired','death','deceased','died')
   and (c.admitted is null or c.discharged>=c.admitted)
 ), returns as (
  select count(*) as followup_count,count(*) filter(where returned) as return_count from followup
 )
 select jsonb_build_object('period_start',b.period_start,'period_end',b.month_start-1,
  'duration_count',s.duration_count,'missing_duration',s.missing_duration,'mean_stay_days',s.mean_stay_days,
  'followup_count',r.followup_count,'return_count',r.return_count,
  'return_rate',case when r.followup_count>0 then round(r.return_count*100.0/r.followup_count,1) else null end)
 into result from bounds b cross join stats s cross join returns r;
 return result;
end $$;
revoke all on function public.kaash_care_quality_report(uuid) from public,anon;
grant execute on function public.kaash_care_quality_report(uuid) to authenticated;
commit;
