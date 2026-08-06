import { useEffect, useState } from 'react'

const useAdminFilters = () => {
  const pageSize = 40
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [sortBy, setSortBy] = useState('name_asc')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm)
    }, 300)

    return () => window.clearTimeout(timer)
  }, [searchTerm])

  const changeSearchTerm = (value) => {
    setSearchTerm(value)
    setPage(1)
  }

  const changeRoleFilter = (value) => {
    setRoleFilter(value)
    setPage(1)
  }

  const changeSortBy = (value) => {
    setSortBy(value)
    setPage(1)
  }

  return {
    searchTerm,
    debouncedSearchTerm,
    setSearchTerm: changeSearchTerm,
    roleFilter,
    setRoleFilter: changeRoleFilter,
    sortBy,
    setSortBy: changeSortBy,
    page,
    setPage,
    pageSize
  }
}

export { useAdminFilters }
