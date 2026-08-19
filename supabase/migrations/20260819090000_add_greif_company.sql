insert into public.companies (slug, name)
values ('greif', 'Greif')
on conflict (slug) do update
set name = excluded.name,
    updated_at = now();
