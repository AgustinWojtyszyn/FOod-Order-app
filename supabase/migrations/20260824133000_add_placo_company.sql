insert into public.companies (slug, name)
values ('placo', 'Placo')
on conflict (slug) do update
set name = excluded.name,
    updated_at = now();
