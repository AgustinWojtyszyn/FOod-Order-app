-- Remove Refrigerio as an orderable Greif menu option.
-- Historical orders/remitos are not changed; this only removes menu choices.

delete from public.menu_items
where lower(trim(coalesce(company_slug, ''))) = 'greif'
  and (
    lower(
      regexp_replace(
        translate(trim(coalesce(name, '')), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'),
        '\s+',
        ' ',
        'g'
      )
    ) = 'refrigerio'
    or lower(
      regexp_replace(
        translate(trim(coalesce(description, '')), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'),
        '\s+',
        ' ',
        'g'
      )
    ) = 'refrigerio'
  );
