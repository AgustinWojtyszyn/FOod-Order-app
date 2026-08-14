-- Root fix for refresh_company_remito_snapshot returning 400.
--
-- The previous versions over-validated frontend snapshot metadata and wrote an
-- audit row inside the same transaction. In production this made valid remito
-- refreshes fail with a generic 400. This RPC keeps the important invariants:
-- authenticated admin access, existing issued remito, same remito number/date,
-- no number consumption. It treats p_snapshot as the source of truth generated
-- by the frontend immediately after refreshing current orders.

alter table public.company_remitos
  add column if not exists updated_at timestamptz,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists snapshot_version integer not null default 1;

create or replace function public.refresh_company_remito_snapshot(
  p_remito_id uuid,
  p_order_ids uuid[] default array[]::uuid[],
  p_snapshot jsonb default null,
  p_request_id text default null
)
returns table (
  remito_id uuid,
  company_slug text,
  company_name text,
  remito_number integer,
  delivery_date date,
  issued_at timestamptz,
  reused boolean,
  status text,
  snapshot jsonb,
  issued_by_email text,
  issued_by_name text,
  location_key text,
  updated_at timestamptz,
  updated_by uuid,
  updated_by_email text,
  updated_by_name text,
  snapshot_version integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company public.companies%rowtype;
  v_existing public.company_remitos%rowtype;
  v_snapshot jsonb;
  v_actor_email text;
  v_actor_name text;
  v_issued_by_email text;
  v_issued_by_name text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if p_remito_id is null then
    raise exception 'remito_required';
  end if;

  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'snapshot_required';
  end if;

  select *
  into v_existing
  from public.company_remitos
  where id = p_remito_id
  for update;

  if not found then
    raise exception 'remito_not_found';
  end if;

  select *
  into v_company
  from public.companies
  where id = v_existing.company_id;

  if not found then
    raise exception 'company_not_found';
  end if;

  if not (
    public.is_admin()
    or public.is_company_admin(v_company.slug)
    or public.has_company_admin_access()
  ) then
    raise exception 'not_authorized';
  end if;

  if v_existing.status <> 'issued' then
    raise exception 'remito_not_refreshable';
  end if;

  if nullif(p_snapshot->>'remitoNumber', '') is not null
    and (p_snapshot->>'remitoNumber') ~ '^[0-9]+$'
    and (p_snapshot->>'remitoNumber')::integer <> v_existing.remito_number then
    raise exception 'snapshot_remito_number_mismatch';
  end if;

  if nullif(p_snapshot->>'deliveryDate', '') is not null
    and (p_snapshot->>'deliveryDate')::date <> v_existing.delivery_date then
    raise exception 'snapshot_delivery_date_mismatch';
  end if;

  select u.email, coalesce(nullif(trim(u.full_name), ''), u.email)
  into v_actor_email, v_actor_name
  from public.users u
  where u.id = auth.uid();

  select u.email, coalesce(nullif(trim(u.full_name), ''), u.email)
  into v_issued_by_email, v_issued_by_name
  from public.users u
  where u.id = v_existing.issued_by;

  v_snapshot := p_snapshot
    || jsonb_build_object(
      'status', 'issued',
      'companySlug', v_company.slug,
      'companyName', v_company.name,
      'remitoNumber', v_existing.remito_number,
      'deliveryDate', v_existing.delivery_date,
      'serviceDate', v_existing.delivery_date,
      'issuedAt', v_existing.issued_at,
      'issuedBy', coalesce(
        v_existing.snapshot->'issuedBy',
        jsonb_build_object(
          'id', v_existing.issued_by,
          'email', v_issued_by_email,
          'name', v_issued_by_name
        )
      ),
      'locationKey', v_existing.location_key,
      'updatedAt', now(),
      'updatedBy', jsonb_build_object(
        'id', auth.uid(),
        'email', v_actor_email,
        'name', v_actor_name
      ),
      'snapshotVersion', coalesce(v_existing.snapshot_version, 1) + 1
    );

  perform set_config('app.allow_issued_remito_snapshot_refresh', 'on', true);

  update public.company_remitos
  set order_ids = coalesce(p_order_ids, array[]::uuid[]),
      snapshot = v_snapshot,
      updated_at = now(),
      updated_by = auth.uid(),
      snapshot_version = coalesce(snapshot_version, 1) + 1
  where id = v_existing.id
  returning *
  into v_existing;

  return query
  select
    v_existing.id,
    v_company.slug,
    v_company.name,
    v_existing.remito_number,
    v_existing.delivery_date,
    v_existing.issued_at,
    true,
    v_existing.status,
    v_existing.snapshot,
    v_issued_by_email,
    v_issued_by_name,
    v_existing.location_key,
    v_existing.updated_at,
    v_existing.updated_by,
    v_actor_email,
    v_actor_name,
    v_existing.snapshot_version;
end;
$$;

revoke all on function public.refresh_company_remito_snapshot(uuid, uuid[], jsonb, text) from public;
revoke all on function public.refresh_company_remito_snapshot(uuid, uuid[], jsonb, text) from anon;
grant execute on function public.refresh_company_remito_snapshot(uuid, uuid[], jsonb, text) to authenticated;
