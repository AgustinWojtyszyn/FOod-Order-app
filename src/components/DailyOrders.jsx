import { useState, useEffect } from 'react'
import { db } from '../supabaseClient'
import { Calendar, MapPin, Clock, User, MessageCircle, Package, TrendingUp, Filter, CheckCircle, XCircle, Download, FileSpreadsheet, Shield, Mail, Send, RefreshCw } from 'lucide-react'
import * as XLSX from 'xlsx'

const DailyOrders = ({ user }) => {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [selectedLocation, setSelectedLocation] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [selectedDish, setSelectedDish] = useState('all')
  const [sortBy, setSortBy] = useState('time') // time, location, status
  const [availableDishes, setAvailableDishes] = useState([])
  const [refreshing, setRefreshing] = useState(false)
  const [stats, setStats] = useState({
    total: 0,
    byLocation: {},
    byDish: {},
    totalItems: 0,
    completed: 0,
    pending: 0,
    cancelled: 0
  })

  const locations = ['Los Berros', 'La Laja', 'Padre Bueno']

  useEffect(() => {
    checkIfAdmin()
  }, [user])

  useEffect(() => {
    if (isAdmin === true) {
      fetchDailyOrders()
      
      // Auto-refresh cada 30 segundos
      const interval = setInterval(() => {
        fetchDailyOrders(true) // true = silent refresh (sin loading)
      }, 30000) // 30 segundos

      return () => clearInterval(interval)
    }
  }, [isAdmin])

  const checkIfAdmin = async () => {
    try {
      const { data, error } = await db.getUsers()
      if (!error && data) {
        const currentUser = data.find(u => u.id === user.id)
        setIsAdmin(currentUser?.role === 'admin')
      }
    } catch (err) {
      console.error('Error checking admin status:', err)
      setIsAdmin(false)
    }
  }

  const fetchDailyOrders = async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true)
      }
      
      const { data: ordersData, error } = await db.getOrders()

      if (error) {
        console.error('Error fetching orders:', error)
      } else {
        // Obtener información de usuarios para mostrar nombres
        const { data: usersData } = await db.getUsers()
        
        // Obtener fecha de hoy
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        
        // Set para almacenar platillos únicos
        const dishesSet = new Set()
        
        // Filtrar solo pedidos de hoy
        const todayOrders = (ordersData || []).filter(order => {
          const orderDate = new Date(order.created_at)
          orderDate.setHours(0, 0, 0, 0)
          return orderDate.getTime() === today.getTime()
        }).map(order => {
          const orderUser = usersData?.find(u => u.id === order.user_id)
          let userName = 'Usuario'
          if (orderUser) {
            userName = orderUser.full_name || 
                      orderUser.user_metadata?.full_name || 
                      orderUser.email?.split('@')[0] || 
                      order.customer_name ||
                      'Usuario'
          } else if (order.customer_name) {
            userName = order.customer_name
          }
          
          // Recopilar platillos únicos
          if (order.items && Array.isArray(order.items)) {
            order.items.forEach(item => {
              if (item.name) {
                dishesSet.add(item.name)
              }
            })
          }
          
          return {
            ...order,
            user_name: userName,
            user_email: orderUser?.email || order.customer_email || ''
          }
        })
        
        setOrders(todayOrders)
        setAvailableDishes(Array.from(dishesSet).sort())
        calculateStats(todayOrders)
      }
    } catch (err) {
      console.error('Error:', err)
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }

  // Función para refrescar manualmente
  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchDailyOrders()
    setRefreshing(false)
  }

  // Función para normalizar nombres de platillos
  const normalizeDishName = (dishName) => {
    if (!dishName) return dishName
    // Convertir "Menú Principal" a "Plato Principal" para consistencia
    return dishName.replace(/Menú Principal/gi, 'Plato Principal')
  }

  const calculateStats = (ordersData) => {
    const byLocation = {}
    const byDish = {}
    let totalItems = 0
    let completed = 0
    let pending = 0
    let cancelled = 0

    ordersData.forEach(order => {
      // Contar por ubicación
      if (!byLocation[order.location]) {
        byLocation[order.location] = 0
      }
      byLocation[order.location]++

      // Contar por platillo (con normalización de nombres)
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach(item => {
          if (item.name) {
            const normalizedName = normalizeDishName(item.name)
            if (!byDish[normalizedName]) {
              byDish[normalizedName] = 0
            }
            byDish[normalizedName] += item.quantity || 1
          }
        })
      }

      // Contar items totales
      totalItems += order.total_items || 0

      // Contar por estado
      if (order.status === 'completed' || order.status === 'delivered') {
        completed++
      } else if (order.status === 'cancelled') {
        cancelled++
      } else {
        pending++
      }
    })

    setStats({
      total: ordersData.length,
      byLocation,
      byDish,
      totalItems,
      completed,
      pending,
      cancelled
    })
  }

  const getTomorrowDate = () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    return tomorrow.toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const formatTime = (dateString) => {
    return new Date(dateString).toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getStatusColor = (status) => {
    switch(status) {
      case 'completed':
      case 'delivered':
        return 'bg-green-100 text-green-800 border-green-300'
      case 'cancelled':
        return 'bg-red-100 text-red-800 border-red-300'
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300'
    }
  }

  const getStatusText = (status) => {
    switch(status) {
      case 'completed':
        return 'Completado'
      case 'delivered':
        return 'Entregado'
      case 'cancelled':
        return 'Cancelado'
      case 'pending':
        return 'Pendiente'
      default:
        return status
    }
  }

  const filteredOrders = selectedLocation === 'all' 
    ? orders 
    : orders.filter(order => order.location === selectedLocation)

  // Aplicar filtro por estado
  const statusFilteredOrders = selectedStatus === 'all'
    ? filteredOrders
    : filteredOrders.filter(order => {
        if (selectedStatus === 'completed') {
          return order.status === 'completed' || order.status === 'delivered'
        }
        return order.status === selectedStatus
      })

  // Aplicar filtro por platillo
  const dishFilteredOrders = selectedDish === 'all'
    ? statusFilteredOrders
    : statusFilteredOrders.filter(order => {
        return order.items?.some(item => item.name === selectedDish)
      })

  // Aplicar ordenamiento
  const sortedOrders = [...dishFilteredOrders].sort((a, b) => {
    switch(sortBy) {
      case 'location':
        return a.location.localeCompare(b.location)
      case 'status':
        return a.status.localeCompare(b.status)
      case 'time':
      default:
        return new Date(b.created_at) - new Date(a.created_at)
    }
  })

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // Función helper para detectar y extraer guarniciones personalizadas
  const getCustomSideFromResponses = (customResponses) => {
    if (!customResponses || !Array.isArray(customResponses)) return null
    
    // Buscar opciones que contengan "guarnición" o "guarnicion" en el título
    const sideOption = customResponses.find(r => 
      r.title?.toLowerCase().includes('guarnición') || 
      r.title?.toLowerCase().includes('guarnicion')
    )
    
    if (sideOption && sideOption.response) {
      return Array.isArray(sideOption.response) 
        ? sideOption.response.join(', ') 
        : sideOption.response
    }
    
    return null
  }

  // Función helper para obtener otras opciones (sin guarniciones)
  const getOtherCustomResponses = (customResponses) => {
    if (!customResponses || !Array.isArray(customResponses)) return []
    
    return customResponses.filter(r => 
      r.response && 
      !r.title?.toLowerCase().includes('guarnición') && 
      !r.title?.toLowerCase().includes('guarnicion')
    )
  }

  const exportToExcel = () => {
    if (sortedOrders.length === 0) {
      alert('No hay pedidos para exportar')
      return
    }

    try {
      // Preparar datos para el Excel
      const excelData = sortedOrders.map(order => {
        // Procesar items del menú (con normalización de nombres)
        const menuItems = order.items?.map(item => 
          `${normalizeDishName(item.name)} (x${item.quantity})`
        ) || []

        // Detectar guarnición personalizada
        const customSide = getCustomSideFromResponses(order.custom_responses)
        if (customSide) {
          menuItems.push(`🔸 Guarnición: ${customSide}`)
        }

        const items = menuItems.join('; ') || 'Sin items'

        // Otras opciones personalizadas (excluyendo guarniciones)
        const otherResponses = getOtherCustomResponses(order.custom_responses)
        const customResponses = otherResponses
          .map(r => {
            const response = Array.isArray(r.response) ? r.response.join(', ') : r.response
            return `${r.title}: ${response}`
          }).join(' | ') || 'Sin opciones'

        return {
          'Fecha Pedido': formatDate(order.created_at),
          'Hora Pedido': formatTime(order.created_at),
          'Usuario': order.user_name || 'Sin nombre',
          'Email': order.customer_email || order.user_email || 'Sin email',
          'Teléfono': order.customer_phone || 'Sin teléfono',
          'Ubicación': order.location || 'Sin ubicación',
          'Fecha Entrega': getTomorrowDate(),
          'Platillos': items,
          'Cantidad Items': order.total_items || 0,
          'Estado': getStatusText(order.status),
          'Comentarios': order.comments || 'Sin comentarios',
          'Opciones Adicionales': customResponses,
          'Cliente': order.customer_name || order.user_name || 'Sin nombre'
        }
      })

      // Crear hoja de estadísticas
      const statsData = [
        { Concepto: 'Total de Pedidos', Valor: stats.total },
        { Concepto: 'Pedidos Completados', Valor: stats.completed },
        { Concepto: 'Pedidos Pendientes', Valor: stats.pending },
        { Concepto: 'Pedidos Cancelados', Valor: stats.cancelled },
        { Concepto: 'Total de Items', Valor: stats.totalItems },
        { Concepto: '', Valor: '' },
        { Concepto: 'PEDIDOS POR UBICACIÓN', Valor: '' },
      ]

      Object.entries(stats.byLocation).forEach(([location, count]) => {
        statsData.push({ Concepto: location, Valor: count })
      })

      statsData.push({ Concepto: '', Valor: '' })
      statsData.push({ Concepto: 'PEDIDOS POR PLATILLO', Valor: '' })

      Object.entries(stats.byDish).forEach(([dish, count]) => {
        statsData.push({ Concepto: dish, Valor: count })
      })

      // Crear libro de Excel
      const wb = XLSX.utils.book_new()
      
      // Hoja 1: Pedidos detallados
      const ws1 = XLSX.utils.json_to_sheet(excelData)
      
      // Ajustar anchos de columna
      const columnWidths = [
        { wch: 12 }, // Fecha Pedido
        { wch: 10 }, // Hora Pedido
        { wch: 20 }, // Usuario
        { wch: 25 }, // Email
        { wch: 15 }, // Teléfono
        { wch: 15 }, // Ubicación
        { wch: 25 }, // Fecha Entrega
        { wch: 40 }, // Platillos
        { wch: 12 }, // Cantidad Items
        { wch: 12 }, // Estado
        { wch: 30 }, // Comentarios
        { wch: 40 }, // Opciones Adicionales
        { wch: 20 }  // Cliente
      ]
      ws1['!cols'] = columnWidths
      
      XLSX.utils.book_append_sheet(wb, ws1, 'Pedidos Detallados')
      
      // Hoja 2: Estadísticas
      const ws2 = XLSX.utils.json_to_sheet(statsData)
      ws2['!cols'] = [{ wch: 30 }, { wch: 15 }]
      XLSX.utils.book_append_sheet(wb, ws2, 'Estadísticas')

      // Generar nombre de archivo
      const today = new Date().toISOString().split('T')[0]
      const locationFilter = selectedLocation !== 'all' ? `_${selectedLocation.replace(/\s+/g, '_')}` : ''
      const statusFilter = selectedStatus !== 'all' ? `_${selectedStatus}` : ''
      const fileName = `Pedidos_ServiFood_${today}${locationFilter}${statusFilter}.xlsx`

      // Descargar archivo con compatibilidad Excel 2016
      XLSX.writeFile(wb, fileName, { 
        bookType: 'xlsx',
        type: 'binary',
        cellStyles: true
      })

      alert(`✓ ${sortedOrders.length} pedidos exportados correctamente a ${fileName}`)
    } catch (error) {
      console.error('Error al exportar:', error)
      alert('Error al exportar el archivo. Por favor, inténtalo de nuevo.')
    }
  }

  // Nueva función para compartir por WhatsApp
  const shareViaWhatsApp = () => {
    if (sortedOrders.length === 0) {
      alert('No hay pedidos para compartir')
      return
    }

    try {
      // Crear resumen de texto para WhatsApp
      const today = new Date().toLocaleDateString('es-ES', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
      
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const tomorrowDate = tomorrow.toLocaleDateString('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
      })

      let message = `📋 *PEDIDOS SERVIFOOD*\n`
      message += `📅 Fecha de pedido: ${today}\n`
      message += `🚚 Fecha de entrega: ${tomorrowDate}\n`
      message += `${'='.repeat(40)}\n\n`

      // RESUMEN GENERAL
      message += `📊 *RESUMEN GENERAL*\n`
      message += `• Total de pedidos: ${stats.total}\n`
      message += `• Completados: ${stats.completed} ✅\n`
      message += `• Pendientes: ${stats.pending} ⏳\n`
      message += `• Cancelados: ${stats.cancelled} ❌\n`
      message += `• Total de items: ${stats.totalItems}\n\n`

      // DESGLOSE POR UBICACIÓN
      message += `📍 *DESGLOSE POR UBICACIÓN*\n`
      Object.entries(stats.byLocation)
        .sort(([, a], [, b]) => b - a)
        .forEach(([location, count]) => {
          // Calcular items por ubicación
          const locationOrders = sortedOrders.filter(o => o.location === location)
          const locationItems = locationOrders.reduce((sum, o) => sum + (o.total_items || 0), 0)
          message += `\n*${location}*\n`
          message += `  • Pedidos: ${count}\n`
          message += `  • Menús: ${locationItems}\n`
        })

      // DETALLE DE PLATILLOS
      message += `\n\n🍽️ *DETALLE DE PLATILLOS*\n`
      const sortedDishes = Object.entries(stats.byDish)
        .sort(([, a], [, b]) => b - a)
      
      let totalMenus = 0
      sortedDishes.forEach(([dish, count]) => {
        totalMenus += count
        message += `• ${dish}: ${count} unidad${count > 1 ? 'es' : ''}\n`
      })
      message += `\n*Total menús del día: ${totalMenus}*\n`

      // GUARNICIONES PERSONALIZADAS
      const customSides = sortedOrders
        .map(order => getCustomSideFromResponses(order.custom_responses))
        .filter(side => side !== null)
      
      if (customSides.length > 0) {
        message += `\n🔸 *GUARNICIONES PERSONALIZADAS*\n`
        const uniqueSides = [...new Set(customSides)]
        uniqueSides.forEach(side => {
          const count = customSides.filter(s => s === side).length
          message += `• ${side}: ${count} pedido${count > 1 ? 's' : ''}\n`
        })
      }

      // OPCIONES ADICIONALES
      const allCustomResponses = sortedOrders
        .flatMap(order => getOtherCustomResponses(order.custom_responses))
        .filter(resp => resp.response)

      if (allCustomResponses.length > 0) {
        message += `\n⚙️ *OPCIONES ADICIONALES*\n`
        
        // Agrupar opciones por título
        const optionsByTitle = {}
        allCustomResponses.forEach(resp => {
          if (!optionsByTitle[resp.title]) {
            optionsByTitle[resp.title] = []
          }
          const response = Array.isArray(resp.response) 
            ? resp.response.join(', ') 
            : resp.response
          optionsByTitle[resp.title].push(response)
        })

        Object.entries(optionsByTitle).forEach(([title, responses]) => {
          message += `\n*${title}*\n`
          
          // Contar respuestas únicas
          const responseCounts = {}
          responses.forEach(resp => {
            responseCounts[resp] = (responseCounts[resp] || 0) + 1
          })
          
          Object.entries(responseCounts)
            .sort(([, a], [, b]) => b - a)
            .forEach(([resp, count]) => {
              message += `  • ${resp}: ${count}\n`
            })
        })
      }

      // DETALLE POR UBICACIÓN Y PLATILLO
      message += `\n\n📋 *DETALLE POR UBICACIÓN*\n`
      Object.entries(stats.byLocation)
        .sort(([, a], [, b]) => b - a)
        .forEach(([location]) => {
          const locationOrders = sortedOrders.filter(o => o.location === location)
          
          message += `\n*${location}:*\n`
          
          // Platillos en esta ubicación (con normalización)
          const dishesInLocation = {}
          locationOrders.forEach(order => {
            if (order.items && Array.isArray(order.items)) {
              order.items.forEach(item => {
                if (item.name) {
                  const normalizedName = normalizeDishName(item.name)
                  dishesInLocation[normalizedName] = (dishesInLocation[normalizedName] || 0) + (item.quantity || 1)
                }
              })
            }
          })
          
          Object.entries(dishesInLocation)
            .sort(([, a], [, b]) => b - a)
            .forEach(([dish, count]) => {
              message += `  • ${dish}: ${count}\n`
            })
        })

      message += `\n${'='.repeat(40)}\n`
      message += `\n✅ *Resumen listo para preparar*\n`
      message += `_Para detalles individuales, consulta el panel de administración_`

      // Abrir WhatsApp con el mensaje
      const encodedMessage = encodeURIComponent(message)
      const whatsappUrl = `https://wa.me/?text=${encodedMessage}`
      window.open(whatsappUrl, '_blank')
    } catch (error) {
      console.error('Error al compartir:', error)
      alert('Error al compartir por WhatsApp')
    }
  }

  if (!isAdmin) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-red-50 border-2 border-red-300 rounded-xl p-8 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-4 bg-red-100 rounded-full">
              <Shield className="h-12 w-12 text-red-600" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-red-900 mb-2">Acceso Restringido</h2>
          <p className="text-red-700">Solo los administradores pueden ver los pedidos diarios.</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent"></div>
        <p className="mt-4 text-white text-lg">Cargando pedidos diarios...</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-2xl p-8 text-white shadow-2xl">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Calendar className="h-10 w-10" />
              <h1 className="text-4xl font-bold">Pedidos Diarios</h1>
            </div>
            <p className="text-blue-100 text-lg">
              Todos los pedidos para entregar mañana
            </p>
            <div className="flex items-center gap-2 mt-3 bg-white/20 rounded-lg px-4 py-2 inline-block">
              <Clock className="h-5 w-5" />
              <span className="font-semibold capitalize">{getTomorrowDate()}</span>
            </div>
          </div>
          
          <div className="flex flex-col gap-3">
            {/* Botón de refrescar */}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className={`font-bold py-3 px-6 rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 flex items-center justify-center gap-2 ${
                refreshing 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
              }`}
            >
              <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Actualizando...' : 'Actualizar Pedidos'}
            </button>

            {/* Botón de exportar a Excel */}
            <button
              onClick={exportToExcel}
              disabled={sortedOrders.length === 0}
              className={`font-bold py-3 px-6 rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 flex items-center justify-center gap-2 ${
                sortedOrders.length === 0 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-green-500 hover:bg-green-600 text-white'
              }`}
            >
              <FileSpreadsheet className="h-5 w-5" />
              Exportar a Excel ({sortedOrders.length})
            </button>

            {/* Botón de compartir por WhatsApp */}
            <button
              onClick={shareViaWhatsApp}
              disabled={sortedOrders.length === 0}
              className={`font-bold py-3 px-6 rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 flex items-center justify-center gap-2 ${
                sortedOrders.length === 0 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              <Send className="h-5 w-5" />
              Compartir Resumen
            </button>

            {/* Filtro por ubicación */}
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
              <label className="text-sm font-semibold mb-2 block flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Filtrar por ubicación
              </label>
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="w-full px-4 py-2 rounded-lg bg-white text-gray-900 font-semibold focus:ring-2 focus:ring-blue-400"
              >
                <option value="all">Todas ({stats.total})</option>
                {locations.map(location => (
                  <option key={location} value={location}>
                    {location} ({stats.byLocation[location] || 0})
                  </option>
                ))}
              </select>
            </div>

            {/* Filtro por estado */}
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
              <label className="text-sm font-semibold mb-2 block flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Filtrar por estado
              </label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full px-4 py-2 rounded-lg bg-white text-gray-900 font-semibold focus:ring-2 focus:ring-blue-400"
              >
                <option value="all">Todos los estados</option>
                <option value="pending">Pendientes ({stats.pending})</option>
                <option value="completed">Completados ({stats.completed})</option>
                <option value="cancelled">Cancelados ({stats.cancelled})</option>
              </select>
            </div>

            {/* Filtro por platillo */}
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
              <label className="text-sm font-semibold mb-2 block flex items-center gap-2">
                <Package className="h-4 w-4" />
                Filtrar por platillo
              </label>
              <select
                value={selectedDish}
                onChange={(e) => setSelectedDish(e.target.value)}
                className="w-full px-4 py-2 rounded-lg bg-white text-gray-900 font-semibold focus:ring-2 focus:ring-blue-400"
              >
                <option value="all">Todos los platillos</option>
                {availableDishes.map(dish => (
                  <option key={dish} value={dish}>
                    {dish} ({stats.byDish[dish] || 0} unidades)
                  </option>
                ))}
              </select>
            </div>

            {/* Ordenar por */}
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4">
              <label className="text-sm font-semibold mb-2 block flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Ordenar por
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full px-4 py-2 rounded-lg bg-white text-gray-900 font-semibold focus:ring-2 focus:ring-blue-400"
              >
                <option value="time">Más recientes primero</option>
                <option value="location">Ubicación (A-Z)</option>
                <option value="status">Estado</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl p-6 shadow-lg border-2 border-blue-200">
          <div className="text-center">
            <Package className="h-8 w-8 text-blue-600 mx-auto mb-2" />
            <p className="text-sm text-gray-600 font-semibold">Total Pedidos</p>
            <p className="text-3xl font-bold text-blue-600">{stats.total}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-lg border-2 border-purple-200">
          <div className="text-center">
            <TrendingUp className="h-8 w-8 text-purple-600 mx-auto mb-2" />
            <p className="text-sm text-gray-600 font-semibold">Total Items</p>
            <p className="text-3xl font-bold text-purple-600">{stats.totalItems}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-lg border-2 border-yellow-200">
          <div className="text-center">
            <Clock className="h-8 w-8 text-yellow-600 mx-auto mb-2" />
            <p className="text-sm text-gray-600 font-semibold">Pendientes</p>
            <p className="text-3xl font-bold text-yellow-600">{stats.pending}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-lg border-2 border-green-200">
          <div className="text-center">
            <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2" />
            <p className="text-sm text-gray-600 font-semibold">Completados</p>
            <p className="text-3xl font-bold text-green-600">{stats.completed}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-lg border-2 border-red-200">
          <div className="text-center">
            <XCircle className="h-8 w-8 text-red-600 mx-auto mb-2" />
            <p className="text-sm text-gray-600 font-semibold">Cancelados</p>
            <p className="text-3xl font-bold text-red-600">{stats.cancelled}</p>
          </div>
        </div>
      </div>

      {/* Lista de pedidos */}
      {sortedOrders.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center shadow-lg">
          <Package className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-gray-700 mb-2">
            No hay pedidos que coincidan con los filtros
          </h3>
          <p className="text-gray-500">
            {selectedLocation !== 'all' && `Ubicación: ${selectedLocation}`}
            {selectedLocation !== 'all' && selectedStatus !== 'all' && ' | '}
            {selectedStatus !== 'all' && `Estado: ${getStatusText(selectedStatus)}`}
          </p>
          <p className="text-gray-400 mt-2 text-sm">Intenta cambiar los filtros para ver más resultados</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <Package className="h-6 w-6" />
              Listado de Pedidos ({sortedOrders.length})
            </h2>
            <div className="text-white bg-white/20 px-4 py-2 rounded-lg">
              <span className="font-semibold">
                Ordenado por: {
                  sortBy === 'time' ? 'Más recientes' :
                  sortBy === 'location' ? 'Ubicación' :
                  'Estado'
                }
              </span>
            </div>
          </div>
          
          {sortedOrders.map((order) => (
            <div 
              key={order.id} 
              className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow border-2 border-gray-200 overflow-hidden"
            >
              {/* Header del pedido */}
              <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-b-2 border-gray-200">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <User className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">{order.user_name}</h3>
                      <p className="text-sm text-gray-600">{order.user_email}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <span className={`px-4 py-2 rounded-lg font-bold text-sm border-2 ${getStatusColor(order.status)}`}>
                      {getStatusText(order.status)}
                    </span>
                    <span className="text-sm text-gray-500">
                      {formatTime(order.created_at)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Contenido del pedido */}
              <div className="p-6 space-y-4">
                {/* Ubicación */}
                <div className="flex items-center gap-3 bg-blue-50 rounded-lg p-4 border-2 border-blue-200">
                  <MapPin className="h-6 w-6 text-blue-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-gray-600 font-semibold">Ubicación de Entrega</p>
                    <p className="text-lg font-bold text-gray-900">{order.location}</p>
                  </div>
                </div>

                {/* Items del pedido */}
                <div className="bg-gray-50 rounded-lg p-4 border-2 border-gray-200">
                  <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                    <Package className="h-5 w-5 text-gray-700" />
                    Platillos Solicitados ({order.total_items} items)
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {order.items && order.items.map((item, index) => (
                      <div key={index} className="bg-white rounded-lg p-3 border border-gray-200">
                        <div className="flex items-center justify-between">
                          <span style={{ fontWeight: '900' }} className="text-gray-900">{item.name}</span>
                          <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-bold">
                            x{item.quantity}
                          </span>
                        </div>
                      </div>
                    ))}
                    
                    {/* Guarnición personalizada si existe */}
                    {(() => {
                      const customSide = getCustomSideFromResponses(order.custom_responses)
                      if (customSide) {
                        return (
                          <div className="bg-orange-50 rounded-lg p-3 border-2 border-orange-300">
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="font-bold text-orange-900">🔸 Guarnición Personalizada</span>
                                <p className="text-sm font-bold text-orange-700 mt-1">{customSide}</p>
                              </div>
                              <span className="px-3 py-1 bg-orange-200 text-orange-900 rounded-full text-xs font-bold">
                                CUSTOM
                              </span>
                            </div>
                          </div>
                        )
                      }
                      return null
                    })()}
                  </div>
                </div>

                {/* Aclaraciones especiales */}
                {(order.comments || getOtherCustomResponses(order.custom_responses).length > 0) && (
                  <div className="bg-purple-50 rounded-lg p-4 border-2 border-purple-200">
                    <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                      <MessageCircle className="h-5 w-5 text-purple-600" />
                      Aclaraciones Especiales
                    </h4>
                    
                    {order.comments && (
                      <div className="mb-3">
                        <p className="text-sm text-gray-600 font-semibold mb-1">Comentarios:</p>
                        <p className="text-gray-900 bg-white rounded-lg p-3 border border-purple-200">
                          {order.comments}
                        </p>
                      </div>
                    )}

                    {getOtherCustomResponses(order.custom_responses).length > 0 && (
                      <div className="space-y-2">
                        <p style={{ fontWeight: '900' }} className="text-sm text-gray-900 mb-2">Opciones Adicionales:</p>
                        {getOtherCustomResponses(order.custom_responses)
                          .map((resp, index) => (
                            <div key={index} className="bg-white rounded-lg p-3 border border-purple-200">
                              <p style={{ fontWeight: '900' }} className="text-purple-900 text-sm mb-1">{resp.title}</p>
                              <p style={{ fontWeight: '900' }} className="text-gray-900">
                                {Array.isArray(resp.response) 
                                  ? resp.response.join(', ') 
                                  : resp.response}
                              </p>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Info de contacto adicional */}
                {(order.customer_phone) && (
                  <div className="bg-green-50 rounded-lg p-4 border-2 border-green-200">
                    <h4 className="font-bold text-gray-900 mb-2 text-sm">Información de Contacto</h4>
                    <p className="text-gray-900">📞 {order.customer_phone}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Resumen por ubicación */}
      {selectedLocation === 'all' && stats.total > 0 && (
        <div className="bg-white rounded-xl shadow-lg border-2 border-gray-200 p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <MapPin className="h-6 w-6 text-blue-600" />
            Resumen por Ubicación
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {locations.map(location => (
              <div key={location} className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border-2 border-blue-200">
                <h3 className="font-bold text-gray-900 text-lg mb-2">{location}</h3>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Pedidos:</span>
                  <span className="text-2xl font-bold text-blue-600">
                    {stats.byLocation[location] || 0}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default DailyOrders
