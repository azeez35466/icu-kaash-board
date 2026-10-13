-- Replace the email with the account created under Supabase Auth > Users.
-- First query the ICU_UNIT_ID returned by 003_initialize_unit.sql.
-- Then replace both placeholders and run this statement in SQL Editor.
insert into public.kaash_members(user_id,unit_id,role)
select u.id,'REPLACE_WITH_ICU_UNIT_UUID'::uuid,'admin'
from auth.users u
where lower(u.email)=lower('REPLACE_WITH_ADMIN_EMAIL')
on conflict (user_id,unit_id) do update set role='admin';
