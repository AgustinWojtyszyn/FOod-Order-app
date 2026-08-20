-- Controlled data fix for the empty EPSE ghost remito 30006.
-- Do not run before deploying the EPSE requesting-location grouping fix.
-- Expected target:
--   remito_id: 9baaa0ea-9cc7-4aa5-93fa-4640fec58f41
--   company: EPSE
--   delivery_date: 2026-08-21
--   remito_number: 30006
--   status: issued
--   order_ids/snapshot totals/location_key: empty or zero

begin;

do $$
declare
  v_remito public.company_remitos%rowtype;
  v_company_slug text;
  v_snapshot jsonb;
begin
  select cr.*
    into v_remito
  from public.company_remitos cr
  where cr.id = '9baaa0ea-9cc7-4aa5-93fa-4640fec58f41'::uuid
  for update;

  if not found then
    raise exception 'ghost_remito_30006_not_found';
  end if;

  select c.slug
    into v_company_slug
  from public.companies c
  where c.id = v_remito.company_id;

  v_snapshot := coalesce(v_remito.snapshot, '{}'::jsonb);

  if v_company_slug <> 'epse'
    or v_remito.remito_number <> 30006
    or v_remito.delivery_date <> date '2026-08-21'
    or v_remito.status <> 'issued'
    or coalesce(v_remito.location_key, '') <> ''
    or cardinality(coalesce(v_remito.order_ids, array[]::uuid[])) <> 0
    or jsonb_array_length(coalesce(v_snapshot->'orderIds', '[]'::jsonb)) <> 0
    or coalesce((v_snapshot->>'ordersCount')::integer, 0) <> 0
    or coalesce((v_snapshot->>'totalItems')::integer, 0) <> 0
    or coalesce((v_snapshot->>'totalMenus')::integer, 0) <> 0
    or coalesce(v_snapshot->>'locationKey', '') <> ''
    or coalesce(v_snapshot->>'locationLabel', '') <> ''
  then
    raise exception 'ghost_remito_30006_safety_check_failed';
  end if;

  update public.company_remitos
  set
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_by = auth.uid(),
    cancellation_reason = 'Anulación controlada: remito EPSE 30006 fantasma vacío, emitido sin location_key ni pedidos.',
    updated_at = now()
  where id = v_remito.id;
end $$;

commit;
