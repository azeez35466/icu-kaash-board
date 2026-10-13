-- Run after 001_pilot.sql in the NEW test project.
-- Creates one demo ICU unit and its empty board; safe to re-run.
insert into public.kaash_units(name)
select 'ICU KAASH'
where not exists (select 1 from public.kaash_units where name='ICU KAASH');
insert into public.kaash_boards(unit_id)
select id from public.kaash_units where name='ICU KAASH'
on conflict (unit_id) do nothing;
select id as ICU_UNIT_ID, name from public.kaash_units where name='ICU KAASH';
