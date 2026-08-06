export const createMenuService = ({
  supabase,
  cache = null,
  invalidateCache = () => {},
  logAudit = null
} = {}) => {
  if (!supabase) {
    throw new Error('createMenuService requires a supabase client')
  }

  // Menú (por día)
  const normalizeCompanySlug = (value) => (value || 'global').toString().trim().toLowerCase() || 'global'

  const getMenuDatesByRange = async ({ start, end, companySlug = 'global' }) => {
    if (!start || !end) return { data: [], error: null }
    const { data, error } = await supabase
      .from('menu_items')
      .select('menu_date')
      .eq('company_slug', normalizeCompanySlug(companySlug))
      .gte('menu_date', start)
      .lte('menu_date', end)
      .order('menu_date', { ascending: true })
    if (error) return { data: [], error }
    const unique = []
    const seen = new Set()
    ;(data || []).forEach(row => {
      const value = row?.menu_date
      if (value && !seen.has(value)) {
        seen.add(value)
        unique.push({ menu_date: value })
      }
    })
    return { data: unique, error: null }
  }

  const getMenuItemsByDate = async (menuDate, companySlug = 'global') => {
    const normalizedCompanySlug = normalizeCompanySlug(companySlug)
    const cacheKey = `menu-items:${normalizedCompanySlug}:${menuDate}`
    const cached = cache?.get?.(cacheKey)
    if (cached) return { data: cached, error: null }

    const { data, error } = await supabase
      .from('menu_items')
      .select('id, name, description, created_at, menu_date, company_slug')
      .eq('menu_date', menuDate)
      .eq('company_slug', normalizedCompanySlug)
      .order('created_at', { ascending: false })

    if (!error && data && cache?.set) {
      cache.set(cacheKey, data, 300000)
    }

    return { data, error }
  }

  const updateMenuItemsByDate = async (menuDate, menuItems, requestId = null, companySlug = 'global') => {
    try {
      const normalizedCompanySlug = normalizeCompanySlug(companySlug)
      invalidateCache() // Limpiar cache al actualizar menú

      const { data: existingItems, error: fetchError } = await supabase
        .from('menu_items')
        .select('id')
        .eq('menu_date', menuDate)
        .eq('company_slug', normalizedCompanySlug)

      if (fetchError) {
        console.error('Error fetching existing items:', fetchError)
        return { error: fetchError }
      }

      const existingIds = existingItems?.map(item => item.id) || []
      const itemsToUpdate = menuItems.filter(item => item.id && existingIds.includes(item.id))
      const itemsToInsert = menuItems.filter(item => !item.id)
      const staleItems = menuItems.filter(item => item.id && !existingIds.includes(item.id))

      // Actualizar items existentes
      for (const item of itemsToUpdate) {
        const { error: updateError } = await supabase
          .from('menu_items')
          .update({
            name: item.name,
            description: item.description
          })
          .eq('id', item.id)
          .eq('menu_date', menuDate)
          .eq('company_slug', normalizedCompanySlug)

        if (updateError) {
          console.error('Error updating item:', updateError)
          return { error: updateError }
        }
      }

      // Insertar nuevos items
      if (itemsToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('menu_items')
          .insert(itemsToInsert.map(item => ({
            name: item.name,
            description: item.description,
            menu_date: menuDate,
            company_slug: normalizedCompanySlug
          })))

        if (insertError) {
          console.error('Error inserting items:', insertError)
          return { error: insertError }
        }
      }

      // Obtener todos los items actualizados (solo del día)
      const { data, error } = await supabase
        .from('menu_items')
        .select('id, name, description, created_at, menu_date, company_slug')
        .eq('menu_date', menuDate)
        .eq('company_slug', normalizedCompanySlug)
        .order('created_at', { ascending: true })

      if (!error && typeof logAudit === 'function') {
        const summary = {
          inserted: itemsToInsert.length,
          updated: itemsToUpdate.length,
          deleted: 0,
          skipped_stale: staleItems.length,
          total: data?.length || 0
        }
        await logAudit({
          action: 'menu_updated',
          details: `Menú diario actualizado (${menuDate}) (agregados: ${summary.inserted}, editados: ${summary.updated}, omitidos por estar desactualizados: ${summary.skipped_stale}, total vigente: ${summary.total})`,
          target_name: 'Todos los usuarios',
          metadata: {
            summary,
            menu_date: menuDate,
            company_slug: normalizedCompanySlug,
            items: (menuItems || []).map(({ id, name }) => ({ id, name }))
          },
          request_id: requestId
        })
      }

      return { data, error }
    } catch (err) {
      console.error('Unexpected error in updateMenuItems:', err)
      return { error: err }
    }
  }

  const addMenuItemsByDate = async (menuDate, menuItems, requestId = null, companySlug = 'global') => {
    try {
      const normalizedCompanySlug = normalizeCompanySlug(companySlug)
      const itemsToInsert = (menuItems || [])
        .filter(item => !item.id && (item.name || '').trim() !== '')
        .map(item => ({
          name: item.name,
          description: item.description || ''
        }))

      if (itemsToInsert.length === 0) {
        return { data: [], error: null }
      }

      invalidateCache()
      const { data, error } = await supabase.rpc('add_menu_items_for_date', {
        p_menu_date: menuDate,
        p_company_slug: normalizedCompanySlug,
        p_items: itemsToInsert,
        p_request_id: requestId
      })

      if (!error && typeof logAudit === 'function') {
        await logAudit({
          action: 'menu_options_added',
          details: `Opciones agregadas al menú (${menuDate}) (agregadas: ${itemsToInsert.length})`,
          target_name: 'Todos los usuarios',
          metadata: {
            inserted: itemsToInsert.length,
            menu_date: menuDate,
            company_slug: normalizedCompanySlug,
            items: itemsToInsert.map(({ name }) => ({ name }))
          },
          request_id: requestId
        })
      }

      return { data, error }
    } catch (err) {
      console.error('Unexpected error in addMenuItemsByDate:', err)
      return { error: err }
    }
  }

  const deleteMenuItemById = async ({ menuDate, itemId, companySlug = 'global', requestId = null }) => {
    try {
      if (!menuDate || !itemId) return { error: new Error('menuDate and itemId are required') }
      const normalizedCompanySlug = normalizeCompanySlug(companySlug)
      invalidateCache()

      const { data: existingItem, error: fetchError } = await supabase
        .from('menu_items')
        .select('id, name')
        .eq('id', itemId)
        .eq('menu_date', menuDate)
        .eq('company_slug', normalizedCompanySlug)
        .maybeSingle()

      if (fetchError) return { error: fetchError }
      if (!existingItem) return { data: null, error: null }

      const { error: deleteError } = await supabase
        .from('menu_items')
        .delete()
        .eq('id', itemId)
        .eq('menu_date', menuDate)
        .eq('company_slug', normalizedCompanySlug)

      if (deleteError) return { error: deleteError }

      if (typeof logAudit === 'function') {
        await logAudit({
          action: 'menu_item_deleted',
          details: `Plato eliminado del menú (${menuDate}): ${existingItem.name || itemId}`,
          target_name: 'Todos los usuarios',
          metadata: {
            menu_date: menuDate,
            company_slug: normalizedCompanySlug,
            item: existingItem
          },
          request_id: requestId
        })
      }

      return { data: existingItem, error: null }
    } catch (err) {
      console.error('Unexpected error in deleteMenuItemById:', err)
      return { error: err }
    }
  }

  // Menú de cena por fecha (opción exclusiva)
  const getDinnerMenuByDate = async ({ date, company }) => {
    if (!date) return { data: null, error: null }

    const normalizedCompany = (company || '').toString().trim()
    const companyCandidates = Array.from(new Set(
      [normalizedCompany, normalizedCompany.toLowerCase()].filter(Boolean)
    ))

    const fetchSingleByCompany = async ({ value, useNull = false }) => {
      let query = supabase
        .from('dinner_menu_by_date')
        .select('*')
        .eq('delivery_date', date)
        .limit(1)
        .maybeSingle()
      query = useNull ? query.is('company', null) : query.eq('company', value)
      return query
    }

    for (const candidate of companyCandidates) {
      const result = await fetchSingleByCompany({ value: candidate })
      if (!result?.error && result?.data) return { data: result.data, error: null }
      if (result?.error) return result
    }

    const globalNullResult = await fetchSingleByCompany({ useNull: true })
    if (!globalNullResult?.error && globalNullResult?.data) return { data: globalNullResult.data, error: null }
    if (globalNullResult?.error) return globalNullResult

    const globalEmptyResult = await fetchSingleByCompany({ value: '' })
    if (!globalEmptyResult?.error && globalEmptyResult?.data) return { data: globalEmptyResult.data, error: null }
    if (globalEmptyResult?.error) return globalEmptyResult

    return { data: null, error: null }
  }

  const upsertDinnerMenuByDate = async ({ deliveryDate, company, title, options, active = true }) => {
    const payload = {
      delivery_date: deliveryDate,
      company: company || null,
      title,
      options,
      active,
      updated_at: new Date().toISOString()
    }
    const { data, error } = await supabase
      .from('dinner_menu_by_date')
      .upsert(payload, { onConflict: 'delivery_date,company' })
      .select()
    return { data, error }
  }

  const getDinnerMenusByDateRange = async ({ start, end }) => {
    const { data, error } = await supabase
      .from('dinner_menu_by_date')
      .select('*')
      .gte('delivery_date', start)
      .lte('delivery_date', end)
      .order('delivery_date', { ascending: true })
    return { data, error }
  }

  return {
    getMenuDatesByRange,
    getMenuItemsByDate,
    addMenuItemsByDate,
    updateMenuItemsByDate,
    deleteMenuItemById,
    getDinnerMenuByDate,
    upsertDinnerMenuByDate,
    getDinnerMenusByDateRange
  }
}
