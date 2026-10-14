begin;
create table if not exists public.kaash_linen_stock (
 unit_id uuid not null references public.kaash_units(id),
 item text not null check(item in ('gowns','blankets','sheets')),
 clean integer not null default 0 check(clean>=0),
 in_use integer not null default 0 check(in_use>=0),
 dirty integer not null default 0 check(dirty>=0),
 laundry integer not null default 0 check(laundry>=0),
 initialized boolean not null default false,
 primary key(unit_id,item)
);
create table if not exists public.kaash_linen_moves (
 id uuid primary key,
 unit_id uuid not null references public.kaash_units(id),
 item text not null,
 action text not null,
 quantity integer not null check(quantity>=0),
 bucket text,
 note text not null default '',
 shift text not null check(shift in ('Day','Evening','Night')),
 actor uuid not null references auth.users(id),
 at timestamptz not null default now(),
 balances jsonb not null
);
create index if not exists kaash_linen_moves_page on public.kaash_linen_moves(unit_id,at desc);
alter table public.kaash_linen_stock enable row level security;
alter table public.kaash_linen_moves enable row level security;
drop policy if exists linen_stock_read on public.kaash_linen_stock;
create policy linen_stock_read on public.kaash_linen_stock for select to authenticated
 using(exists(select 1 from public.kaash_members m where m.user_id=auth.uid() and m.unit_id=kaash_linen_stock.unit_id and m.role<>'print_agent'));
drop policy if exists linen_moves_read on public.kaash_linen_moves;
create policy linen_moves_read on public.kaash_linen_moves for select to authenticated
 using(exists(select 1 from public.kaash_members m where m.user_id=auth.uid() and m.unit_id=kaash_linen_moves.unit_id and m.role<>'print_agent'));
grant select on public.kaash_linen_stock,public.kaash_linen_moves to authenticated;
create or replace function public.kaash_linen_move(
 p_id uuid,p_unit uuid,p_item text,p_action text,p_quantity integer,
 p_shift text,p_note text default '',p_bucket text default null,p_opening jsonb default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.kaash_linen_stock; existing public.kaash_linen_moves; from_bucket text; to_bucket text;
 c integer; u integer; d integer; l integer; available integer;
begin
 if not exists(select 1 from public.kaash_members m where m.user_id=auth.uid()
  and m.unit_id=p_unit and m.role in ('admin','doctor','charge_nurse')) then
  raise exception 'Editing role required' using errcode='42501';
 end if;
 if p_item not in ('gowns','blankets','sheets') or p_shift not in ('Day','Evening','Night') then raise exception 'Invalid item or shift';end if;
 insert into public.kaash_linen_stock(unit_id,item) values(p_unit,p_item) on conflict do nothing;
 select * into s from public.kaash_linen_stock where unit_id=p_unit and item=p_item for update;
 select * into existing from public.kaash_linen_moves where id=p_id;
 if found then
  if existing.unit_id<>p_unit or existing.item<>p_item or existing.action<>p_action
   or existing.quantity<>(case when p_action='opening' then coalesce((p_opening->>'clean')::integer,0)+coalesce((p_opening->>'in_use')::integer,0)+coalesce((p_opening->>'dirty')::integer,0)+coalesce((p_opening->>'laundry')::integer,0) else p_quantity end) or existing.actor<>auth.uid()
   or existing.bucket is distinct from p_bucket or existing.note<>left(coalesce(p_note,''),300)
   or existing.shift<>p_shift then raise exception 'Movement ID already used';end if;
  return to_jsonb(s);
 end if;
 c=s.clean;u=s.in_use;d=s.dirty;l=s.laundry;
 if p_action='opening' then
  if s.initialized then raise exception 'Opening balance already recorded';end if;
  c=coalesce((p_opening->>'clean')::integer,0);u=coalesce((p_opening->>'in_use')::integer,0);
  d=coalesce((p_opening->>'dirty')::integer,0);l=coalesce((p_opening->>'laundry')::integer,0);
  if least(c,u,d,l)<0 then raise exception 'Negative opening balance';end if;
 else
  if not s.initialized then raise exception 'Record opening balance first';end if;
  if p_quantity is null or p_quantity<=0 then raise exception 'Positive whole quantity required';end if;
  case p_action
   when 'received' then to_bucket='clean';
   when 'issued' then from_bucket='clean';to_bucket='in_use';
   when 'soiled' then from_bucket='in_use';to_bucket='dirty';
   when 'sent' then from_bucket='dirty';to_bucket='laundry';
   when 'returned' then from_bucket='laundry';to_bucket='clean';
   when 'loss' then
    if p_bucket not in ('clean','in_use','dirty','laundry') or p_bucket is null or length(trim(coalesce(p_note,'')))=0 then raise exception 'Loss needs a bucket and reason';end if;
    from_bucket=p_bucket;
   else raise exception 'Invalid movement';
  end case;
  available=case from_bucket when 'clean' then c when 'in_use' then u when 'dirty' then d when 'laundry' then l else null end;
  if available is not null and p_quantity>available then raise exception 'Insufficient stock: available %',available;end if;
  if from_bucket='clean' then c=c-p_quantity;elsif from_bucket='in_use' then u=u-p_quantity;elsif from_bucket='dirty' then d=d-p_quantity;elsif from_bucket='laundry' then l=l-p_quantity;end if;
  if to_bucket='clean' then c=c+p_quantity;elsif to_bucket='in_use' then u=u+p_quantity;elsif to_bucket='dirty' then d=d+p_quantity;elsif to_bucket='laundry' then l=l+p_quantity;end if;
 end if;
 update public.kaash_linen_stock set clean=c,in_use=u,dirty=d,laundry=l,initialized=true
 where unit_id=p_unit and item=p_item returning * into s;
 insert into public.kaash_linen_moves(id,unit_id,item,action,quantity,bucket,note,shift,actor,balances)
 values(p_id,p_unit,p_item,p_action,case when p_action='opening' then c+u+d+l else p_quantity end,p_bucket,left(coalesce(p_note,''),300),p_shift,auth.uid(),to_jsonb(s));
 return to_jsonb(s);
end $$;
revoke all on function public.kaash_linen_move(uuid,uuid,text,text,integer,text,text,text,jsonb) from public,anon;
grant execute on function public.kaash_linen_move(uuid,uuid,text,text,integer,text,text,text,jsonb) to authenticated;
commit;
