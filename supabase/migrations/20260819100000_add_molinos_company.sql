insert into public.companies (slug, name)
values ('molinos', 'Molinos')
on conflict (slug) do update
set name = excluded.name,
    updated_at = now();
