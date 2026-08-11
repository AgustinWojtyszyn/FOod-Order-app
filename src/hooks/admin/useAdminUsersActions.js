import { useState } from 'react'
import { usersService } from '../../services/users'
import { notifyError, notifySuccess, notifyWarning } from '../../utils/notice'
import { confirmAction } from '../../utils/confirm'
import { getUserFriendlyErrorMessage } from '../../utils'

const useAdminUsersActions = ({
  user,
  refreshPermissions,
  refreshAdminData
}) => {
  const [expandedPeople, setExpandedPeople] = useState({})
  const [roleUpdatingById, setRoleUpdatingById] = useState({})
  const [deletingById, setDeletingById] = useState({})

  const togglePersonDetails = (personId) => {
    if (!personId) return
    setExpandedPeople(prev => ({
      ...prev,
      [personId]: !prev[personId]
    }))
  }

  const isPersonExpanded = (personId) => !!expandedPeople[personId]

  const handleRoleChange = async (userId, newRole) => {
    if (!userId || roleUpdatingById[userId] || deletingById[userId]) return
    setRoleUpdatingById(prev => ({ ...prev, [userId]: true }))
    try {
      const roleValue = newRole.toLowerCase()
      const { data, error } = await usersService.updateUserRole(userId, roleValue)
      if (error) {
        notifyError(getUserFriendlyErrorMessage(error, 'No pudimos actualizar el rol. Intentá nuevamente.'))
        return
      }
      if (!data || (Array.isArray(data) && data.length === 0)) {
        notifyWarning('No se pudo actualizar el rol. Verifica las políticas de seguridad o el valor enviado.')
        return
      }
      notifySuccess('Rol actualizado correctamente')
      await refreshAdminData()
      if (user && user.id === userId) {
        await refreshPermissions()
      }
    } catch (err) {
      notifyError(getUserFriendlyErrorMessage(err, 'No pudimos actualizar el rol. Intentá nuevamente.'))
    } finally {
      setRoleUpdatingById(prev => ({ ...prev, [userId]: false }))
    }
  }

  const handleDeleteUser = async (userId) => {
    if (!userId || deletingById[userId]) return
    const confirmed = await confirmAction({
      title: 'Eliminar usuario',
      message: 'El usuario será eliminado. Todos sus pedidos históricos se conservarán.',
      highlight: 'No se eliminarán pedidos asociados al usuario.',
      confirmText: 'Eliminar usuario'
    })
    if (!confirmed) return

    try {
      setDeletingById(prev => ({ ...prev, [userId]: true }))
      const { error } = await usersService.deleteUser(userId)

      if (error) {
        notifyError(getUserFriendlyErrorMessage(error, 'No pudimos eliminar el usuario. Intentá nuevamente.'))
      } else {
        notifySuccess('Usuario eliminado exitosamente')
        await refreshAdminData()
      }
    } catch (err) {
      notifyError(getUserFriendlyErrorMessage(err, 'No pudimos eliminar el usuario. Intentá nuevamente.'))
    } finally {
      setDeletingById(prev => ({ ...prev, [userId]: false }))
    }
  }

  return {
    isPersonExpanded,
    togglePersonDetails,
    handleRoleChange,
    handleDeleteUser,
    roleUpdatingById,
    deletingById
  }
}

export { useAdminUsersActions }
