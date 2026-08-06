import { useCallback, useEffect, useState } from 'react'
import { db } from '../../supabaseClient'
import { normalizeAdminPeoplePage } from '../../domain/admin/adminMappers'

const useAdminUsersData = ({
  enabled = true,
  searchTerm = '',
  roleFilter = 'all',
  sortBy = 'name_asc',
  page = 1,
  pageSize = 40
} = {}) => {
  const [users, setUsers] = useState([])
  const [usersTotalCount, setUsersTotalCount] = useState(0)
  const [usersTotalPages, setUsersTotalPages] = useState(1)
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState('')

  useEffect(() => {
    if (enabled) return
    setUsers([])
    setUsersTotalCount(0)
    setUsersTotalPages(1)
    setUsersError('')
  }, [enabled])

  const refreshUsers = useCallback(async () => {
    if (!enabled) return
    setUsersLoading(true)
    setUsersError('')
    try {
      const peopleResult = await db.getAdminPeoplePage({
        search: searchTerm,
        role: roleFilter,
        sort: sortBy,
        page,
        pageSize
      })

      if (peopleResult.error) {
        console.error('Error fetching admin people:', peopleResult.error)
        setUsersError('No se pudo cargar la lista de personas.')
        return
      }

      const pageData = normalizeAdminPeoplePage(peopleResult.data || {})
      setUsers(pageData.items)
      setUsersTotalCount(pageData.total_count)
      setUsersTotalPages(pageData.total_pages)
    } catch (err) {
      console.error('Error fetching users:', err)
      setUsersError('No se pudo cargar la lista de usuarios.')
    } finally {
      setUsersLoading(false)
    }
  }, [enabled, page, pageSize, roleFilter, searchTerm, sortBy])

  useEffect(() => {
    refreshUsers()
  }, [refreshUsers])

  return {
    users,
    usersTotalCount,
    usersTotalPages,
    usersLoading,
    usersError,
    refreshUsers
  }
}

export { useAdminUsersData }
