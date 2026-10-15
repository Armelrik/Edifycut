-- Apply once in the Supabase SQL editor before enabling ACCOUNT_PROVIDER.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null check (char_length(name) between 1 and 100),
  role text not null default 'user' check (role in ('user', 'admin')),
  disabled boolean not null default false,
  session_version integer not null default 1,
  created_at timestamptz not null default now()
);
create or replace function public.create_edifycut_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,email,name)
  values(new.id,coalesce(new.email,''),left(coalesce(nullif(btrim(new.raw_user_meta_data->>'name'),''),'Utilisateur'),100));
  return new;
end;
$$;
drop trigger if exists edifycut_profile_created on auth.users;
create trigger edifycut_profile_created after insert on auth.users
for each row execute function public.create_edifycut_profile();
create or replace function public.sync_edifycut_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin update public.profiles set email = coalesce(new.email,'') where id = new.id; return new; end;
$$;
drop trigger if exists edifycut_email_updated on auth.users;
create trigger edifycut_email_updated after update of email on auth.users
for each row execute function public.sync_edifycut_email();
insert into public.profiles(id,email,name)
select id,coalesce(email,''),left(coalesce(nullif(btrim(raw_user_meta_data->>'name'),''),'Utilisateur'),100)
from auth.users on conflict(id) do nothing;

create table if not exists public.pro_access (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  expires_at timestamptz not null, granted_by text not null, updated_at timestamptz not null default now()
);
create table if not exists public.user_presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  version integer not null, last_seen bigint not null
);
create table if not exists public.paypal_orders (
  id uuid primary key, user_id uuid not null references public.profiles(id),
  paypal_id text unique, capture_id text unique, status text not null,
  paid_until timestamptz, created_at bigint not null, mode text not null check (mode in ('sandbox','live'))
);
create index if not exists paypal_orders_owner on public.paypal_orders(user_id,created_at desc);
create table if not exists public.usage_samples (
  time bigint not null, instance_id text not null, cpu double precision, rss bigint not null,
  memory_used bigint not null, memory_total bigint not null, online integer not null,
  primary key(time,instance_id)
);
alter table public.profiles enable row level security;
alter table public.pro_access enable row level security;
alter table public.user_presence enable row level security;
alter table public.paypal_orders enable row level security;
alter table public.usage_samples enable row level security;
revoke all on public.profiles, public.pro_access, public.user_presence, public.paypal_orders, public.usage_samples from anon, authenticated;
grant select on public.profiles, public.pro_access to authenticated;
grant all on public.profiles, public.pro_access, public.user_presence, public.paypal_orders, public.usage_samples to service_role;
drop policy if exists own_profile on public.profiles;
create policy own_profile on public.profiles for select to authenticated using ((select auth.uid()) = id);
drop policy if exists own_pro_access on public.pro_access;
create policy own_pro_access on public.pro_access for select to authenticated using (
  (select auth.uid()) = user_id and exists(select 1 from public.profiles p where p.id = (select auth.uid()) and not p.disabled)
);

create or replace function public.admin_update_account(
  actor_id uuid, target_id uuid, new_role text default null,
  new_disabled boolean default null, pro_action text default null,
  bump_version boolean default false, live_mode boolean default false
) returns void language plpgsql security definer set search_path = '' as $$
declare target public.profiles; expiry timestamptz; source text;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(88392001);
  if not exists(select 1 from public.profiles where id = actor_id and role = 'admin' and not disabled) then raise exception 'admin required'; end if;
  select * into strict target from public.profiles where id = target_id for update;
  if new_role is not null and new_role not in ('user','admin') then raise exception 'invalid role'; end if;
  if pro_action is not null and pro_action not in ('grant','revoke') then raise exception 'invalid action'; end if;
  if actor_id = target_id and (coalesce(new_disabled,false) or coalesce(new_role,target.role) <> 'admin') then raise exception 'cannot remove own access'; end if;
  if target.role = 'admin' and not target.disabled and
    (coalesce(new_disabled,target.disabled) or coalesce(new_role,target.role) <> 'admin') and
    (select count(*) from public.profiles where role = 'admin' and not disabled) <= 1 then
    raise exception 'last administrator';
  end if;
  if pro_action = 'revoke' then delete from public.pro_access where user_id = target_id; end if;
  if pro_action = 'grant' then
    if coalesce(new_disabled,target.disabled) then raise exception 'disabled account'; end if;
    select expires_at,granted_by into expiry,source from public.pro_access where user_id = target_id;
    if live_mode and source like 'paypal:sandbox:%' then expiry := null; end if;
    expiry := greatest(now(),coalesce(expiry,now())) + interval '1 year';
    insert into public.pro_access values(target_id,expiry,actor_id::text,now())
    on conflict(user_id) do update set expires_at=excluded.expires_at,granted_by=excluded.granted_by,updated_at=excluded.updated_at;
  end if;
  update public.profiles set role=coalesce(new_role,role),disabled=coalesce(new_disabled,disabled),
    session_version=session_version + case when bump_version or new_role is not null or new_disabled is not null then 1 else 0 end
  where id=target_id;
end;
$$;
create or replace function public.reserve_paypal_order(order_id uuid, owner_id uuid, payment_mode text, current_time_ms bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text,0));
  if not exists(select 1 from public.profiles where id=owner_id and not disabled) then raise exception 'inactive account'; end if;
  if exists(select 1 from public.pro_access where user_id=owner_id and expires_at>now() and not(payment_mode='live' and granted_by like 'paypal:sandbox:%')) then raise exception 'already pro'; end if;
  if exists(select 1 from public.paypal_orders where user_id=owner_id and mode=payment_mode and status='CREATING' and created_at>current_time_ms-120000) then raise exception 'payment in progress'; end if;
  insert into public.paypal_orders(id,user_id,status,created_at,mode) values(order_id,owner_id,'CREATING',current_time_ms,payment_mode);
end;
$$;
create or replace function public.finalize_paypal_order(order_id uuid, owner_id uuid, payment_mode text, capture text, expiry timestamptz)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare payment public.paypal_orders;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  select * into strict payment from public.paypal_orders where id=order_id and user_id=owner_id and mode=payment_mode for update;
  if payment.status in ('REFUNDED','REVERSED') then raise exception 'payment revoked'; end if;
  if payment.status='COMPLETED' then return payment.paid_until; end if;
  update public.paypal_orders set status='COMPLETED',capture_id=capture,paid_until=expiry where id=order_id;
  insert into public.pro_access values(owner_id,expiry,'paypal:'||payment_mode||':'||capture,now())
  on conflict(user_id) do update set expires_at=excluded.expires_at,granted_by=excluded.granted_by,updated_at=excluded.updated_at
  where public.pro_access.expires_at<excluded.expires_at or (payment_mode='live' and public.pro_access.granted_by like 'paypal:sandbox:%');
  return expiry;
end;
$$;
create or replace function public.refund_paypal_capture(capture text,payment_mode text,new_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' or new_status not in ('REFUNDED','REVERSED') then raise exception 'invalid request'; end if;
  perform 1 from public.paypal_orders where capture_id=capture and mode=payment_mode for update;
  update public.paypal_orders set status=new_status where capture_id=capture and mode=payment_mode;
  delete from public.pro_access where granted_by='paypal:'||payment_mode||':'||capture;
end;
$$;
create or replace function public.count_active_accounts(cutoff bigint)
returns bigint language sql security definer set search_path = '' as $$
  select count(*) from public.user_presence p join public.profiles u on u.id=p.user_id
  where p.last_seen>=cutoff and p.version=u.session_version and not u.disabled and auth.role()='service_role';
$$;
revoke all on function public.create_edifycut_profile(),public.sync_edifycut_email() from public,anon,authenticated;
revoke all on function public.admin_update_account(uuid,uuid,text,boolean,text,boolean,boolean),
  public.reserve_paypal_order(uuid,uuid,text,bigint),public.finalize_paypal_order(uuid,uuid,text,text,timestamptz),
  public.refund_paypal_capture(text,text,text),public.count_active_accounts(bigint) from public,anon,authenticated;
grant execute on function public.admin_update_account(uuid,uuid,text,boolean,text,boolean,boolean),
  public.reserve_paypal_order(uuid,uuid,text,bigint),public.finalize_paypal_order(uuid,uuid,text,text,timestamptz),
  public.refund_paypal_capture(text,text,text),public.count_active_accounts(bigint) to service_role;
