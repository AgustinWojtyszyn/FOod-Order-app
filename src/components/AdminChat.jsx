import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { Send, Trash2, Edit2, X, MessageCircle, Users } from 'lucide-react'

const AdminChat = ({ user }) => {
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editingText, setEditingText] = useState('')
  const [loading, setLoading] = useState(false)
  const [admins, setAdmins] = useState({})
  const messagesEndRef = useRef(null)

  useEffect(() => {
    loadMessages()
    loadAdmins()
    
    const subscription = subscribeToMessages()
    
    return () => {
      if (subscription) subscription()
    }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const loadAdmins = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, email')
        .eq('role', 'admin')

      if (!error && data) {
        const adminsMap = {}
        data.forEach(admin => {
          adminsMap[admin.id] = admin
        })
        setAdmins(adminsMap)
      }
    } catch (err) {
      console.error('Error loading admins:', err)
    }
  }

  const loadMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('admin_chat')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(100)

      if (!error && data) {
        setMessages(data)
      }
    } catch (err) {
      console.error('Error loading messages:', err)
    }
  }

  const subscribeToMessages = () => {
    console.log('Setting up realtime subscription...')
    
    const channel = supabase
      .channel('admin-chat-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'admin_chat'
        },
        (payload) => {
          console.log('🔔 Realtime event:', payload)
          
          if (payload.eventType === 'INSERT') {
            setMessages(prev => {
              // Evitar duplicados
              const exists = prev.some(msg => msg.id === payload.new.id)
              if (exists) {
                console.log('Message already exists, skipping')
                return prev
              }
              console.log('Adding new message to state')
              return [...prev, payload.new]
            })
          } else if (payload.eventType === 'UPDATE') {
            console.log('Updating message in state')
            setMessages(prev =>
              prev.map(msg => msg.id === payload.new.id ? payload.new : msg)
            )
          } else if (payload.eventType === 'DELETE') {
            console.log('Removing message from state')
            setMessages(prev => prev.filter(msg => msg.id !== payload.old.id))
          }
        }
      )
      .subscribe((status, err) => {
        console.log('📡 Subscription status:', status)
        if (err) {
          console.error('❌ Subscription error:', err)
        }
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to admin_chat realtime')
        }
      })

    return () => {
      console.log('🧹 Cleaning up subscription')
      channel.unsubscribe()
    }
  }

  const sendMessage = async (e) => {
    e.preventDefault()
    if (!newMessage.trim() || loading) return

    const messageText = newMessage.trim()
    setNewMessage('') // Limpiar input inmediatamente
    setLoading(true)

    // Crear mensaje temporal para mostrar instantáneamente (optimistic update)
    const tempMessage = {
      id: `temp-${Date.now()}`,
      user_id: user.id,
      message: messageText,
      created_at: new Date().toISOString(),
      is_edited: false,
      _temp: true // Marcar como temporal
    }

    // Agregar mensaje temporalmente
    setMessages(prev => [...prev, tempMessage])

    try {
      const { data, error } = await supabase
        .from('admin_chat')
        .insert({
          user_id: user.id,
          message: messageText
        })
        .select()
        .single()

      if (error) {
        // Si hay error, remover el mensaje temporal
        setMessages(prev => prev.filter(msg => msg.id !== tempMessage.id))
        setNewMessage(messageText) // Restaurar el texto
        console.error('Error sending message:', error)
      } else if (data) {
        // Reemplazar mensaje temporal con el real
        setMessages(prev => 
          prev.map(msg => msg.id === tempMessage.id ? data : msg)
        )
      }
    } catch (err) {
      // Si hay error, remover el mensaje temporal
      setMessages(prev => prev.filter(msg => msg.id !== tempMessage.id))
      setNewMessage(messageText) // Restaurar el texto
      console.error('Error sending message:', err)
    } finally {
      setLoading(false)
    }
  }

  const startEdit = (msg) => {
    setEditingId(msg.id)
    setEditingText(msg.message)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditingText('')
  }

  const saveEdit = async (msgId) => {
    if (!editingText.trim()) return

    const newText = editingText.trim()
    const originalMessage = messages.find(msg => msg.id === msgId)

    // Actualización optimista - mostrar cambio inmediatamente
    setMessages(prev =>
      prev.map(msg => 
        msg.id === msgId 
          ? { ...msg, message: newText, is_edited: true, updated_at: new Date().toISOString() }
          : msg
      )
    )
    setEditingId(null)
    setEditingText('')

    try {
      const { error } = await supabase
        .from('admin_chat')
        .update({ message: newText })
        .eq('id', msgId)

      if (error) {
        // Si hay error, revertir al mensaje original
        console.error('Error editing message:', error)
        setMessages(prev =>
          prev.map(msg => msg.id === msgId ? originalMessage : msg)
        )
        // Restaurar modo edición
        setEditingId(msgId)
        setEditingText(originalMessage.message)
      } else {
        console.log('✏️ Message edited successfully')
      }
    } catch (err) {
      console.error('Error editing message:', err)
      // Revertir al mensaje original
      setMessages(prev =>
        prev.map(msg => msg.id === msgId ? originalMessage : msg)
      )
      setEditingId(msgId)
      setEditingText(originalMessage.message)
    }
  }

  const deleteMessage = async (msgId) => {
    if (!confirm('¿Eliminar este mensaje?')) return

    const messageToDelete = messages.find(msg => msg.id === msgId)

    // Actualización optimista - eliminar inmediatamente de la UI
    setMessages(prev => prev.filter(msg => msg.id !== msgId))
    console.log('🗑️ Deleting message optimistically')

    try {
      const { error } = await supabase
        .from('admin_chat')
        .delete()
        .eq('id', msgId)

      if (error) {
        // Si hay error, restaurar el mensaje
        console.error('Error deleting message:', error)
        setMessages(prev => {
          // Encontrar la posición correcta para reinsertar
          const index = prev.findIndex(msg => 
            new Date(msg.created_at) > new Date(messageToDelete.created_at)
          )
          if (index === -1) {
            return [...prev, messageToDelete]
          }
          return [
            ...prev.slice(0, index),
            messageToDelete,
            ...prev.slice(index)
          ]
        })
      } else {
        console.log('✅ Message deleted successfully')
      }
    } catch (err) {
      console.error('Error deleting message:', err)
      // Restaurar el mensaje
      setMessages(prev => {
        const index = prev.findIndex(msg => 
          new Date(msg.created_at) > new Date(messageToDelete.created_at)
        )
        if (index === -1) {
          return [...prev, messageToDelete]
        }
        return [
          ...prev.slice(0, index),
          messageToDelete,
          ...prev.slice(index)
        ]
      })
    }
  }

  const formatTime = (timestamp) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Ahora'
    if (diffMins < 60) return `Hace ${diffMins}m`
    if (diffHours < 24) return `Hace ${diffHours}h`
    if (diffDays < 7) return `Hace ${diffDays}d`
    
    return date.toLocaleDateString('es-AR', { 
      day: '2-digit', 
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getAdminName = (userId) => {
    return admins[userId]?.full_name || admins[userId]?.email?.split('@')[0] || 'Admin'
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col h-[calc(100vh-12rem)] bg-white rounded-2xl shadow-2xl border-2 border-gray-200">
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white p-4 sm:p-6 rounded-t-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="bg-white/20 p-2 sm:p-3 rounded-lg">
                  <MessageCircle className="h-6 w-6 sm:h-7 sm:w-7" />
                </div>
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold">Chat de Administradores</h2>
                  <p className="text-xs sm:text-sm text-purple-100 flex items-center gap-1 mt-1">
                    <Users className="h-3 w-3 sm:h-4 sm:w-4" />
                    {Object.keys(admins).length} administradores
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 bg-gradient-to-b from-gray-50 to-white">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <MessageCircle className="h-12 w-12 sm:h-16 sm:w-16 mb-3" />
                <p className="text-base sm:text-lg font-medium">No hay mensajes aún</p>
                <p className="text-xs sm:text-sm">Sé el primero en escribir</p>
              </div>
            ) : (
              messages.map((msg) => {
                const isOwnMessage = msg.user_id === user.id
                const isEditing = editingId === msg.id

                return (
                  <div
                    key={msg.id}
                    className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[85%] sm:max-w-[75%] ${isOwnMessage ? 'items-end' : 'items-start'} flex flex-col`}>
                      {/* Author and time */}
                      <div className="flex items-center gap-2 mb-1 px-1">
                        <span className={`text-xs font-semibold ${isOwnMessage ? 'text-purple-600' : 'text-gray-600'}`}>
                          {isOwnMessage ? 'Tú' : getAdminName(msg.user_id)}
                        </span>
                        <span className="text-xs text-gray-400">
                          {formatTime(msg.created_at)}
                          {msg.is_edited && ' (editado)'}
                        </span>
                      </div>

                      {/* Message bubble */}
                      {isEditing ? (
                        <div className="w-full bg-gray-100 rounded-xl p-3 border-2 border-purple-400">
                          <textarea
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                            rows={2}
                            autoFocus
                          />
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => saveEdit(msg.id)}
                              className="px-3 py-1 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
                            >
                              Guardar
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="px-3 py-1 bg-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-400 transition-colors"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          className={`rounded-2xl px-3 sm:px-4 py-2.5 shadow-md ${
                            isOwnMessage
                              ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-br-sm'
                              : 'bg-white text-gray-800 border border-gray-200 rounded-bl-sm'
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>
                        </div>
                      )}

                      {/* Actions (only for own messages) */}
                      {isOwnMessage && !isEditing && (
                        <div className="flex gap-2 mt-1 px-1">
                          <button
                            onClick={() => startEdit(msg)}
                            className="text-xs text-gray-500 hover:text-purple-600 transition-colors flex items-center gap-1"
                          >
                            <Edit2 className="h-3 w-3" />
                            Editar
                          </button>
                          <button
                            onClick={() => deleteMessage(msg.id)}
                            className="text-xs text-gray-500 hover:text-red-600 transition-colors flex items-center gap-1"
                          >
                            <Trash2 className="h-3 w-3" />
                            Eliminar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <form onSubmit={sendMessage} className="p-3 sm:p-4 bg-gray-50 border-t-2 border-gray-200 rounded-b-2xl">
            <div className="flex gap-2">
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    sendMessage(e)
                  }
                }}
                placeholder="Escribe un mensaje... (Enter para enviar)"
                className="flex-1 px-3 sm:px-4 py-2 sm:py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none text-sm sm:text-base"
                rows={2}
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !newMessage.trim()}
                className="px-4 sm:px-6 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-xl font-bold hover:from-purple-700 hover:to-purple-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl flex items-center gap-2"
              >
                <Send className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="hidden sm:inline">Enviar</span>
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Solo visible para administradores
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}

export default AdminChat
