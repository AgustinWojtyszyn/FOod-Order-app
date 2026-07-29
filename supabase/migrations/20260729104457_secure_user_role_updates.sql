-- Restrict public.users updates and route role changes through an admin RPC.

revoke update on table public.users from public;
revoke update on table public.users from anon;
revoke update on table public.users from authenticated;

do $$
declare
  v_column text;
begin
  for v_column in
    select c.column_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'users'
  loop
    execute format('revoke update (%I) on table public.users from public', v_column);
    execute format('revoke update (%I) on table public.users from anon', v_column);
    execute format('revoke update (%I) on table public.users from authenticated', v_column);
  end loop;
end $$;

grant update (full_name) on table public.users to authenticated;

drop policy if exists "Users can update their own profile" on public.users;
drop policy if exists users_update_self_or_admin on public.users;
drop policy if exists users_update_self_profile on public.users;

create policy users_update_self_profile on public.users
for update to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create or replace function public.admin_update_user_role(
  p_user_id uuid,
  p_role text
)
returns table (
  id uuid,
  role text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_is_admin boolean := false;
  v_target_role text;
  v_role text := lower(trim(coalesce(p_role, '')));
  v_admin_count integer := 0;
begin
  if v_actor_id is null then
    raise exception 'not_authenticated';
  end if;

  select exists (
    select 1
    from public.users u
    where u.id = v_actor_id
      and u.role = 'admin'
  )
  into v_actor_is_admin;

  if not v_actor_is_admin then
    raise exception 'not_authorized';
  end if;

  if p_user_id is null then
    raise exception 'target_user_required';
  end if;

  if v_role not in ('user', 'admin') then
    raise exception 'invalid_role';
  end if;

  select u.role
  into v_target_role
  from public.users u
  where u.id = p_user_id;

  if v_target_role is null then
    raise exception 'user_not_found';
  end if;

  if v_target_role = 'admin' and v_role <> 'admin' then
    select count(*)::integer
    into v_admin_count
    from public.users u
    where u.role = 'admin';

    if v_admin_count <= 1 then
      raise exception 'last_admin';
    end if;
  end if;

  update public.users u
  set role = v_role
  where u.id = p_user_id
  returning u.id, u.role
  into id, role;

  return next;
end;
$$;

revoke all on function public.admin_update_user_role(uuid, text) from public;
revoke all on function public.admin_update_user_role(uuid, text) from anon;
grant execute on function public.admin_update_user_role(uuid, text) to authenticated;
