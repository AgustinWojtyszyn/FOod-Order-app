import { useCallback, useEffect, useMemo, useState } from 'react'
import { db } from '../../supabaseClient'
import { ALL_COMPANY_LIST } from '../../constants/companyConfig'
import { notifyError, notifySuccess, notifyWarning } from '../../utils/notice'
import { getUserFriendlyErrorMessage } from '../../utils'
import { confirmAction } from '../../utils/confirm'

const getDefaultCompanyRows = () =>
  ALL_COMPANY_LIST.map((company) => ({
    slug: company.slug,
    name: company.name,
    remito_start_number: null,
    next_remito_number: null,
    issued_count: 0,
    last_remito_number: null
  }))

const normalizeNumberInput = (value) => {
  const numberValue = Number(value)
  if (!Number.isInteger(numberValue) || numberValue <= 0) return null
  return numberValue
}

const useAdminCompaniesData = ({ enabled = true } = {}) => {
  const [companies, setCompanies] = useState(getDefaultCompanyRows)
  const [draftStartNumbers, setDraftStartNumbers] = useState({})
  const [companiesLoading, setCompaniesLoading] = useState(false)
  const [savingCompanySlug, setSavingCompanySlug] = useState(null)
  const [adminEmailDrafts, setAdminEmailDrafts] = useState({})

  const refreshCompanies = useCallback(async () => {
    setCompaniesLoading(true)
    try {
      const { data, error } = await db.getCompaniesRemitoConfig()
      if (error) {
        console.error('Error fetching company remito config:', error)
        notifyError(getUserFriendlyErrorMessage(error, 'No pudimos cargar la numeración de notas de pedido.'))
        return
      }

      const rows = Array.isArray(data) && data.length ? data : getDefaultCompanyRows()
      const { data: assignmentsData, error: assignmentsError } = await db.getCompanyAdminAssignments()
      if (assignmentsError) {
        console.error('Error fetching company admins:', assignmentsError)
      }
      const assignments = Array.isArray(assignmentsData) ? assignmentsData : []
      setCompanies(rows.map((row) => ({
        ...row,
        admins: assignments.filter((assignment) => assignment.company_slug === row.slug)
      })))
      setDraftStartNumbers(Object.fromEntries(
        rows.map((row) => [row.slug, row.remito_start_number == null ? '' : String(row.remito_start_number)])
      ))
    } catch (err) {
      console.error('Error fetching company remito config:', err)
      notifyError(getUserFriendlyErrorMessage(err, 'No pudimos cargar la numeración de notas de pedido.'))
    } finally {
      setCompaniesLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    refreshCompanies()
  }, [enabled, refreshCompanies])

  const usedStartNumbers = useMemo(() => {
    const map = new Map()
    companies.forEach((company) => {
      if (company.remito_start_number != null) {
        map.set(Number(company.remito_start_number), company.slug)
      }
    })
    return map
  }, [companies])

  const handleCompanyStartNumberChange = (companySlug, value) => {
    setDraftStartNumbers((prev) => ({ ...prev, [companySlug]: value }))
  }

  const handleSaveCompanyStartNumber = async (companySlug) => {
    const company = companies.find((row) => row.slug === companySlug)
    if (!company) return

    const nextValue = normalizeNumberInput(draftStartNumbers[companySlug])
    if (nextValue == null) {
      notifyWarning('El número inicial de nota de pedido debe ser un entero positivo.')
      return
    }

    const ownerSlug = usedStartNumbers.get(nextValue)
    if (ownerSlug && ownerSlug !== companySlug) {
      notifyWarning('Ese número inicial ya está configurado para otra empresa.')
      return
    }

    if (Number(company.issued_count || 0) > 0 && nextValue !== Number(company.remito_start_number)) {
      notifyWarning('Esta empresa ya emitió notas de pedido. El número inicial no puede modificarse libremente.')
      return
    }

    setSavingCompanySlug(companySlug)
    try {
      const { error } = await db.updateCompanyRemitoStart({
        companySlug,
        remitoStartNumber: nextValue
      })
      if (error) {
        console.error('Error saving company remito start:', error)
        notifyError(getUserFriendlyErrorMessage(error, 'No pudimos guardar el número inicial de nota de pedido.'))
        return
      }
      await refreshCompanies()
      notifySuccess('Número inicial de nota de pedido guardado.')
    } catch (err) {
      console.error('Error saving company remito start:', err)
      notifyError(getUserFriendlyErrorMessage(err, 'No pudimos guardar el número inicial de nota de pedido.'))
    } finally {
      setSavingCompanySlug(null)
    }
  }

  const handleAdminEmailChange = (companySlug, value) => {
    setAdminEmailDrafts((prev) => ({ ...prev, [companySlug]: value }))
  }

  const handleAssignCompanyAdmin = async (companySlug) => {
    const email = (adminEmailDrafts[companySlug] || '').trim()
    if (!email) {
      notifyWarning('Ingresá el correo del usuario.')
      return
    }

    try {
      const { error } = await db.assignCompanyAdminByEmail({ companySlug, email })
      if (error) {
        console.error('Error assigning company admin:', error)
        notifyError(getUserFriendlyErrorMessage(error, 'No pudimos asignar el administrador de la empresa.'))
        return
      }
      setAdminEmailDrafts((prev) => ({ ...prev, [companySlug]: '' }))
      await refreshCompanies()
      notifySuccess('Administrador asignado a la empresa.')
    } catch (err) {
      console.error('Error assigning company admin:', err)
      notifyError(getUserFriendlyErrorMessage(err, 'No pudimos asignar el administrador de la empresa.'))
    }
  }

  const handleRemoveCompanyAdmin = async ({ companySlug, userId, email }) => {
    const confirmed = await confirmAction({
      title: 'Quitar administrador',
      message: `Se quitará el acceso de ${email || 'este usuario'} a esta empresa.`,
      confirmText: 'Quitar'
    })
    if (!confirmed) return

    try {
      const { error } = await db.removeCompanyAdmin({ companySlug, userId })
      if (error) {
        console.error('Error removing company admin:', error)
        notifyError(getUserFriendlyErrorMessage(error, 'No pudimos quitar el administrador de la empresa.'))
        return
      }
      await refreshCompanies()
      notifySuccess('Administrador quitado de la empresa.')
    } catch (err) {
      console.error('Error removing company admin:', err)
      notifyError(getUserFriendlyErrorMessage(err, 'No pudimos quitar el administrador de la empresa.'))
    }
  }

  return {
    companies,
    draftStartNumbers,
    adminEmailDrafts,
    companiesLoading,
    savingCompanySlug,
    onCompanyStartNumberChange: handleCompanyStartNumberChange,
    onSaveCompanyStartNumber: handleSaveCompanyStartNumber,
    onAdminEmailChange: handleAdminEmailChange,
    onAssignCompanyAdmin: handleAssignCompanyAdmin,
    onRemoveCompanyAdmin: handleRemoveCompanyAdmin,
    onRefreshCompanies: refreshCompanies
  }
}

export { useAdminCompaniesData }
