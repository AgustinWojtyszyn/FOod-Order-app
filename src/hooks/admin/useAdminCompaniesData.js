import { useCallback, useEffect, useMemo, useState } from 'react'
import { db } from '../../supabaseClient'
import { ALL_COMPANY_LIST } from '../../constants/companyConfig'
import {
  createBlankCompanyConfig,
  normalizeCompanyAdminConfig,
  normalizeCompanyAdminSlug
} from '../../services/companies/companyAdminService'
import { notifyError, notifySuccess, notifyWarning } from '../../utils/notice'
import { getUserFriendlyErrorMessage } from '../../utils'
import { confirmAction } from '../../utils/confirm'

const getDefaultCompanyRows = () =>
  ALL_COMPANY_LIST.map((company) => normalizeCompanyAdminConfig({
    ...company,
    active: true,
    visibility: company.adminOnly ? 'admins' : 'public',
    services: [{ service: 'lunch', enabled: true }, { service: 'dinner', enabled: true }],
    remito_start_number: null,
    remito_end_number: null,
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
  const [selectedCompanySlug, setSelectedCompanySlug] = useState('')
  const [companyDraft, setCompanyDraft] = useState(createBlankCompanyConfig)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardStep, setWizardStep] = useState(0)
  const [publishChecklist, setPublishChecklist] = useState([])

  const refreshCompanies = useCallback(async () => {
    setCompaniesLoading(true)
    try {
      const catalogResult = await db.getCompanyAdminCatalog()
      let rows = Array.isArray(catalogResult.data) && catalogResult.data.length
        ? catalogResult.data
        : getDefaultCompanyRows()

      if (catalogResult.error) {
        console.error('Error fetching managed companies:', catalogResult.error)
        const remitoResult = await db.getCompaniesRemitoConfig()
        if (!remitoResult.error && Array.isArray(remitoResult.data) && remitoResult.data.length) {
          const bySlug = new Map(getDefaultCompanyRows().map((row) => [row.slug, row]))
          remitoResult.data.forEach((row) => bySlug.set(row.slug, normalizeCompanyAdminConfig({ ...bySlug.get(row.slug), ...row })))
          rows = Array.from(bySlug.values())
        } else {
          notifyError(getUserFriendlyErrorMessage(catalogResult.error, 'No pudimos cargar la administración de empresas.'))
        }
      }

      const { data: assignmentsData, error: assignmentsError } = await db.getCompanyAdminAssignments()
      if (assignmentsError) {
        console.error('Error fetching company admins:', assignmentsError)
      }
      const assignments = Array.isArray(assignmentsData) ? assignmentsData : []
      const withAdmins = rows.map((row) => ({
        ...normalizeCompanyAdminConfig(row),
        admins: assignments.filter((assignment) => assignment.company_slug === row.slug)
      }))
      setCompanies(withAdmins)
      setDraftStartNumbers(Object.fromEntries(
        withAdmins.map((row) => [row.slug, row.remitos.startNumber == null ? '' : String(row.remitos.startNumber)])
      ))
      if (!selectedCompanySlug && withAdmins[0]?.slug) {
        setSelectedCompanySlug(withAdmins[0].slug)
      }
    } catch (err) {
      console.error('Error fetching managed companies:', err)
      notifyError(getUserFriendlyErrorMessage(err, 'No pudimos cargar la administración de empresas.'))
    } finally {
      setCompaniesLoading(false)
    }
  }, [selectedCompanySlug])

  useEffect(() => {
    if (!enabled) return
    refreshCompanies()
  }, [enabled, refreshCompanies])

  const selectedCompany = useMemo(
    () => companies.find((company) => company.slug === selectedCompanySlug) || null,
    [companies, selectedCompanySlug]
  )

  const usedStartNumbers = useMemo(() => {
    const map = new Map()
    companies.forEach((company) => {
      if (company.remitos?.startNumber != null && company.remitos.startNumber !== '') {
        map.set(Number(company.remitos.startNumber), company.slug)
      }
    })
    return map
  }, [companies])

  const openCompanyWizard = (company = null) => {
    setCompanyDraft(company ? normalizeCompanyAdminConfig(company) : createBlankCompanyConfig())
    setSelectedCompanySlug(company?.slug || '')
    setWizardStep(0)
    setPublishChecklist([])
    setWizardOpen(true)
  }

  const closeCompanyWizard = () => {
    setWizardOpen(false)
    setPublishChecklist([])
  }

  const updateCompanyDraft = (updater) => {
    setCompanyDraft((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }
      const normalized = normalizeCompanyAdminConfig(next)
      if (!prev.slug || prev.slug === normalizeCompanyAdminSlug(prev.name)) {
        normalized.slug = normalizeCompanyAdminSlug(normalized.name)
      }
      return normalized
    })
  }

  const saveCompanyDraft = async ({ publish = false } = {}) => {
    const targetSlug = companyDraft.slug || normalizeCompanyAdminSlug(companyDraft.name)
    setSavingCompanySlug(targetSlug || 'new-company')
    try {
      const validation = await db.validateCompanyAdminConfig({ company: companyDraft, publish })
      if (validation.error) {
        notifyError(getUserFriendlyErrorMessage(validation.error, 'No pudimos validar la empresa.'))
        return false
      }
      const errors = Array.isArray(validation.data?.errors) ? validation.data.errors : []
      setPublishChecklist(errors)
      if (errors.length > 0) {
        notifyWarning(errors[0])
        return false
      }

      const { data, error } = await db.saveCompanyAdminConfig({ company: companyDraft, publish })
      if (error || data?.ok === false) {
        const backendErrors = Array.isArray(data?.errors) ? data.errors : []
        setPublishChecklist(backendErrors)
        notifyError(backendErrors[0] || getUserFriendlyErrorMessage(error, 'No pudimos guardar la empresa.'))
        return false
      }
      await refreshCompanies()
      setWizardOpen(false)
      notifySuccess(publish ? 'Empresa publicada para todos.' : 'Empresa guardada solo para administradores.')
      return true
    } catch (err) {
      notifyError(getUserFriendlyErrorMessage(err, 'No pudimos guardar la empresa.'))
      return false
    } finally {
      setSavingCompanySlug(null)
    }
  }

  const duplicateCompany = async (company) => {
    const name = `${company.name} copia`
    const slug = normalizeCompanyAdminSlug(`${company.slug}_copia`)
    const confirmed = await confirmAction({
      title: 'Duplicar empresa',
      message: `Se copiará la configuración de ${company.name}, sin pedidos, usuarios, históricos ni remitos emitidos.`,
      confirmText: 'Duplicar'
    })
    if (!confirmed) return

    setSavingCompanySlug(company.slug)
    try {
      const { data, error } = await db.duplicateCompanyAdminConfig({ sourceSlug: company.slug, name, slug })
      if (error || data?.ok === false) {
        notifyError(getUserFriendlyErrorMessage(error, 'No pudimos duplicar la empresa.'))
        return
      }
      await refreshCompanies()
      notifySuccess('Empresa duplicada en modo solo administradores.')
    } finally {
      setSavingCompanySlug(null)
    }
  }

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

    if (Number(company.issuedCount || 0) > 0 && nextValue !== Number(company.remitos.startNumber)) {
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
        notifyError(getUserFriendlyErrorMessage(error, 'No pudimos guardar el número inicial de nota de pedido.'))
        return
      }
      await refreshCompanies()
      notifySuccess('Número inicial de nota de pedido guardado.')
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
    const { error } = await db.assignCompanyAdminByEmail({ companySlug, email })
    if (error) {
      notifyError(getUserFriendlyErrorMessage(error, 'No pudimos asignar el administrador de la empresa.'))
      return
    }
    setAdminEmailDrafts((prev) => ({ ...prev, [companySlug]: '' }))
    await refreshCompanies()
    notifySuccess('Administrador asignado a la empresa.')
  }

  const handleRemoveCompanyAdmin = async ({ companySlug, userId, email }) => {
    const confirmed = await confirmAction({
      title: 'Quitar administrador',
      message: `Se quitará el acceso de ${email || 'este usuario'} a esta empresa.`,
      confirmText: 'Quitar'
    })
    if (!confirmed) return
    const { error } = await db.removeCompanyAdmin({ companySlug, userId })
    if (error) {
      notifyError(getUserFriendlyErrorMessage(error, 'No pudimos quitar el administrador de la empresa.'))
      return
    }
    await refreshCompanies()
    notifySuccess('Administrador quitado de la empresa.')
  }

  return {
    companies,
    selectedCompany,
    selectedCompanySlug,
    companyDraft,
    wizardOpen,
    wizardStep,
    publishChecklist,
    draftStartNumbers,
    adminEmailDrafts,
    companiesLoading,
    savingCompanySlug,
    onSelectCompany: setSelectedCompanySlug,
    onOpenCompanyWizard: openCompanyWizard,
    onCloseCompanyWizard: closeCompanyWizard,
    onWizardStepChange: setWizardStep,
    onCompanyDraftChange: updateCompanyDraft,
    onSaveCompanyDraft: saveCompanyDraft,
    onDuplicateCompany: duplicateCompany,
    onCompanyStartNumberChange: handleCompanyStartNumberChange,
    onSaveCompanyStartNumber: handleSaveCompanyStartNumber,
    onAdminEmailChange: handleAdminEmailChange,
    onAssignCompanyAdmin: handleAssignCompanyAdmin,
    onRemoveCompanyAdmin: handleRemoveCompanyAdmin,
    onRefreshCompanies: refreshCompanies
  }
}

export { useAdminCompaniesData }
