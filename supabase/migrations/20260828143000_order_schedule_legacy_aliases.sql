begin;

insert into public.order_schedule_location_overrides (
  location_key,
  flow,
  label
)
values
  ('laja', 'extended', 'La Laja'),
  ('losberros', 'extended', 'Los Berros'),
  ('padrebueno', 'extended', 'Padre Bueno')
on conflict (location_key) do update
set
  flow = excluded.flow,
  label = excluded.label,
  updated_at = now();

commit;