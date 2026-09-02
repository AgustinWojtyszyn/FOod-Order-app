begin;

create or replace function public.get_company_admin_deletion_status(p_company_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company public.companies%rowtype;
  v_has_activity boolean;
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  select * into v_company
  from public.companies
  where slug = public.normalize_company_admin_slug(p_company_slug);

  if not found then
    raise exception 'company_not_found';
  end if;

  select exists (
    select 1 from public.orders o
    where lower(trim(coalesce(o.company_slug, ''))) = v_company.slug
    union all
    select 1 from public.cafeteria_orders o
    where lower(trim(coalesce(o.company_slug, ''))) = v_company.slug
    union all
    select 1 from public.company_remitos r
    where r.company_id = v_company.id
    union all
    select 1 from public.order_locations l
    where l.company_id = v_company.id
    union all
    select 1 from public.late_admin_extra_order_history h
    where lower(trim(coalesce(h.company_slug, ''))) = v_company.slug
    union all
    select 1 from public.audit_logs a
    where lower(trim(coalesce(a.metadata->>'company_slug', ''))) = v_company.slug
       or a.target_id = v_company.id
    union all
    select 1 from public.daily_operational_closures d
    where d.snapshot::text ilike '%' || v_company.slug || '%'
    union all
    select 1 from public.late_admin_extra_order_closures c
    where c.snapshot::text ilike '%' || v_company.slug || '%'
  ) into v_has_activity;

  return jsonb_build_object(
    'company_slug', v_company.slug,
    'has_activity', v_has_activity,
    'active', v_company.active
  );
end;
$$;

create or replace function public.manage_company_admin_lifecycle(
  p_company_slug text,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company public.companies%rowtype;
  v_status jsonb;
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  if p_action not in ('delete', 'deactivate') then
    raise exception 'invalid_company_lifecycle_action';
  end if;

  select * into v_company
  from public.companies
  where slug = public.normalize_company_admin_slug(p_company_slug)
  for update;

  if not found then
    raise exception 'company_not_found';
  end if;

  v_status := public.get_company_admin_deletion_status(v_company.slug);

  if p_action = 'deactivate' or (v_status->>'has_activity')::boolean then
    update public.companies
    set active = false, updated_at = now()
    where id = v_company.id;

    return v_status || jsonb_build_object('action', 'deactivated');
  end if;

  delete from public.companies where id = v_company.id;
  return v_status || jsonb_build_object('action', 'deleted');
end;
$$;

revoke all on function public.get_company_admin_deletion_status(text) from public;
grant execute on function public.get_company_admin_deletion_status(text) to authenticated;
grant execute on function public.get_company_admin_deletion_status(text) to anon;

revoke all on function public.manage_company_admin_lifecycle(text, text) from public;
grant execute on function public.manage_company_admin_lifecycle(text, text) to authenticated;
grant execute on function public.manage_company_admin_lifecycle(text, text) to anon;

commit;