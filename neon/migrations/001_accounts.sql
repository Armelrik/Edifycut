create schema if not exists edifycut;
create table if not exists edifycut.profiles (
 id uuid primary key references neon_auth."user"(id) on delete cascade,
 email text not null, name text not null,
 role text not null default 'user' check(role in ('user','admin')),
 disabled boolean not null default false,
 session_version integer not null default 1,
 created_at timestamptz not null default now()
);
create table if not exists edifycut.pro_access (
  user_id uuid primary key references edifycut.profiles(id) on delete cascade,
  expires_at timestamptz not null, granted_by text not null, updated_at timestamptz not null default now()
);
create table if not exists edifycut.user_presence (
  user_id uuid primary key references edifycut.profiles(id) on delete cascade,
  version integer not null, last_seen bigint not null
);
create table if not exists edifycut.paypal_orders (
  id uuid primary key, user_id uuid not null references edifycut.profiles(id),
  paypal_id text unique, capture_id text unique, status text not null,
  paid_until timestamptz, created_at bigint not null, mode text not null check (mode in ('sandbox','live'))
);
create index if not exists paypal_orders_owner on edifycut.paypal_orders(user_id,created_at desc);
create table if not exists edifycut.usage_samples (
  time bigint not null, instance_id text not null, cpu double precision, rss bigint not null,
  memory_used bigint not null, memory_total bigint not null, online integer not null,
  primary key(time,instance_id)
);
create or replace function edifycut.admin_update_account(
  actor_id uuid, target_id uuid, new_role text default null,
  new_disabled boolean default null, pro_action text default null,
  bump_version boolean default false, live_mode boolean default false
) returns void language plpgsql security invoker set search_path = '' as $$
declare target edifycut.profiles; expiry timestamptz; source text;
begin
  perform pg_catalog.pg_advisory_xact_lock(88392001);
  if not exists(select 1 from edifycut.profiles where id = actor_id and role = 'admin' and not disabled) then raise exception 'admin required'; end if;
  select * into strict target from edifycut.profiles where id = target_id for update;
  if new_role is not null and new_role not in ('user','admin') then raise exception 'invalid role'; end if;
  if pro_action is not null and pro_action not in ('grant','revoke') then raise exception 'invalid action'; end if;
  if actor_id = target_id and (coalesce(new_disabled,false) or coalesce(new_role,target.role) <> 'admin') then raise exception 'cannot remove own access'; end if;
  if target.role = 'admin' and not target.disabled and
    (coalesce(new_disabled,target.disabled) or coalesce(new_role,target.role) <> 'admin') and
    (select count(*) from edifycut.profiles where role = 'admin' and not disabled) <= 1 then
    raise exception 'last administrator';
  end if;
  if pro_action = 'revoke' then delete from edifycut.pro_access where user_id = target_id; end if;
  if pro_action = 'grant' then
    if coalesce(new_disabled,target.disabled) then raise exception 'disabled account'; end if;
    select expires_at,granted_by into expiry,source from edifycut.pro_access where user_id = target_id;
    if live_mode and source like 'paypal:sandbox:%' then expiry := null; end if;
    expiry := greatest(now(),coalesce(expiry,now())) + interval '1 year';
    insert into edifycut.pro_access values(target_id,expiry,actor_id::text,now())
    on conflict(user_id) do update set expires_at=excluded.expires_at,granted_by=excluded.granted_by,updated_at=excluded.updated_at;
  end if;
  update edifycut.profiles set role=coalesce(new_role,role),disabled=coalesce(new_disabled,disabled),
    session_version=session_version + case when bump_version or new_role is not null or new_disabled is not null then 1 else 0 end
  where id=target_id;
end;
$$;
create or replace function edifycut.reserve_paypal_order(order_id uuid, owner_id uuid, payment_mode text, current_time_ms bigint)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text,0));
  if not exists(select 1 from edifycut.profiles where id=owner_id and not disabled) then raise exception 'inactive account'; end if;
  if exists(select 1 from edifycut.pro_access where user_id=owner_id and expires_at>now() and not(payment_mode='live' and granted_by like 'paypal:sandbox:%')) then raise exception 'already pro'; end if;
  if exists(select 1 from edifycut.paypal_orders where user_id=owner_id and mode=payment_mode and status='CREATING' and created_at>current_time_ms-120000) then raise exception 'payment in progress'; end if;
  insert into edifycut.paypal_orders(id,user_id,status,created_at,mode) values(order_id,owner_id,'CREATING',current_time_ms,payment_mode);
end;
$$;
create or replace function edifycut.finalize_paypal_order(order_id uuid, owner_id uuid, payment_mode text, capture text, expiry timestamptz)
returns timestamptz language plpgsql security invoker set search_path = '' as $$
declare payment edifycut.paypal_orders;
begin
  select * into strict payment from edifycut.paypal_orders where id=order_id and user_id=owner_id and mode=payment_mode for update;
  if payment.status in ('REFUNDED','REVERSED') then raise exception 'payment revoked'; end if;
  if payment.status='COMPLETED' then return payment.paid_until; end if;
  update edifycut.paypal_orders set status='COMPLETED',capture_id=capture,paid_until=expiry where id=order_id;
  insert into edifycut.pro_access values(owner_id,expiry,'paypal:'||payment_mode||':'||capture,now())
  on conflict(user_id) do update set expires_at=excluded.expires_at,granted_by=excluded.granted_by,updated_at=excluded.updated_at
  where edifycut.pro_access.expires_at<excluded.expires_at or (payment_mode='live' and edifycut.pro_access.granted_by like 'paypal:sandbox:%');
  return expiry;
end;
$$;
create or replace function edifycut.refund_paypal_capture(capture text,payment_mode text,new_status text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if new_status not in ('REFUNDED','REVERSED') then raise exception 'invalid request'; end if;
  perform 1 from edifycut.paypal_orders where capture_id=capture and mode=payment_mode for update;
  update edifycut.paypal_orders set status=new_status where capture_id=capture and mode=payment_mode;
  delete from edifycut.pro_access where granted_by='paypal:'||payment_mode||':'||capture;
end;
$$;
create or replace function edifycut.count_active_accounts(cutoff bigint)
returns bigint language sql security invoker set search_path = '' as $$
  select count(*) from edifycut.user_presence p join edifycut.profiles u on u.id=p.user_id
  where p.last_seen>=cutoff and p.version=u.session_version and not u.disabled;
$$;

revoke all on schema edifycut from public;
revoke all on all tables in schema edifycut from public;
revoke all on all functions in schema edifycut from public;
