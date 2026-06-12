(function () {
  const STORAGE_KEY = 'privateKitchenWebStateV2'
  const STATUS_TEXT = {
    SUBMITTED: '已下单，等你接单',
    ACCEPTED: '你已接单',
    COOKING: '正在制作',
    READY: '可以吃啦',
    FINISHED: '已完成',
    CANCELLED: '已取消'
  }
  const TASTE_OPTIONS = ['少盐', '少油', '不放葱', '不放蒜', '不辣']
  const CATEGORY_OPTIONS = ['全部', '她爱吃', '家常菜', '主食', '素菜', '蒸菜']
  const DB_CONFIG = window.KITCHEN_SUPABASE_CONFIG || {}
  const CHEF_PASSWORD = 'zazll'

  const app = document.getElementById('app')
  const toast = document.getElementById('toast')
  const ui = {
    view: 'customer',
    customerCategory: '全部',
    keyword: '',
    selectedDishId: '',
    selectedOrderId: '',
    chefTab: 'orders',
    inventoryTab: 'materials',
    editingDishId: '',
    modal: '',
    dishFlagDrafts: {}
  }

  let state = loadState()
  let dbClient = null
  let dbReady = false
  let dbLoading = true
  let dbMessage = ''
  let dbSaveTimer = null
  let lastDbWarningAt = 0
  let chefUnlocked = sessionStorage.getItem('privateKitchenChefUnlocked') === 'true'

  function clone(value) {
    return JSON.parse(JSON.stringify(value))
  }

  function uid(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
  }

  function loadState() {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        return {
          ...freshState(),
          ...parsed,
          cart: {
            ...freshState().cart,
            ...(parsed.cart || {})
          },
          email: {
            ...freshState().email,
            ...(parsed.email || {})
          }
        }
      } catch (error) {
        console.warn('Cannot parse saved state, fallback to seed.', error)
      }
    }
    return freshState()
  }

  function freshState() {
    const seed = clone(window.KITCHEN_SEED || {})
    const emailConfig = window.KITCHEN_EMAIL_CONFIG || {}
    return {
      dishes: seed.dishes || [],
      materials: seed.materials || [],
      seasonings: seed.seasonings || [],
      tools: seed.tools || [],
      recipes: seed.recipes || [],
      orders: [],
      auditLogs: [],
      cart: {
        items: [],
        remark: '',
        expectedTime: '现在就吃',
        customExpectedAt: '',
        expectedMonth: '',
        expectedDay: '',
        expectedClock: ''
      },
      email: {
        enabled: Boolean(emailConfig.enabled),
        serviceId: emailConfig.serviceId || '',
        templateId: emailConfig.templateId || '',
        publicKey: emailConfig.publicKey || '',
        toEmail: emailConfig.toEmail || 'mxinyu2003@163.com',
        siteUrl: emailConfig.siteUrl || ''
      }
    }
  }

  function isDbConfigured() {
    return Boolean(DB_CONFIG.enabled && DB_CONFIG.url && DB_CONFIG.anonKey && window.supabase)
  }

  function initDatabase() {
    if (!isDbConfigured()) {
      dbReady = false
      dbMessage = DB_CONFIG.enabled
        ? '数据库配置不完整，请检查 config/supabase-config.js'
        : '未启用 Supabase 数据库，保存类操作会被拦截'
      return
    }
    dbClient = window.supabase.createClient(DB_CONFIG.url, DB_CONFIG.anonKey)
  }

  function warnDbRequired(actionName) {
    const now = Date.now()
    if (now - lastDbWarningAt > 900) {
      showToast(`请先配置 Supabase 数据库，再${actionName}`)
      lastDbWarningAt = now
    }
    ui.view = 'settings'
    render()
  }

  function requireDatabase(actionName) {
    if (dbReady) return true
    warnDbRequired(actionName)
    return false
  }

  async function loadStateFromDatabase() {
    if (!dbClient) return
    const stateId = DB_CONFIG.stateId || 'main'
    const { data, error } = await dbClient
      .from('kitchen_state')
      .select('data')
      .eq('id', stateId)
      .maybeSingle()
    if (error) throw error
    if (data && data.data) {
      state = {
        ...freshState(),
        ...data.data,
        cart: {
          ...freshState().cart,
          ...(data.data.cart || {})
        },
        email: {
          ...freshState().email,
          ...(data.data.email || {})
        }
      }
      await syncLogsFromDatabase()
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      return
    }
    await dbClient.from('kitchen_state').upsert({
      id: stateId,
      data: state,
      updated_at: new Date().toISOString()
    })
    await syncLogsFromDatabase()
  }

  async function syncLogsFromDatabase() {
    if (!dbClient) return
    const { data, error } = await dbClient
      .from('kitchen_audit_logs')
      .select('id, action, detail, payload, created_at')
      .order('created_at', { ascending: false })
      .limit(300)
    if (error) {
      console.error(error)
      return
    }
    if (data && data.length) {
      state.auditLogs = data.map((item) => ({
        id: item.id,
        action: item.action,
        detail: item.detail,
        payload: item.payload || {},
        createdAt: item.created_at
      }))
    }
  }

  async function saveStateToDatabase() {
    if (!dbReady || !dbClient) return
    const stateId = DB_CONFIG.stateId || 'main'
    const { error } = await dbClient.from('kitchen_state').upsert({
      id: stateId,
      data: state,
      updated_at: new Date().toISOString()
    })
    if (error) {
      console.error(error)
      showToast('数据库保存失败，请检查 Supabase 配置')
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    if (!dbReady) return
    window.clearTimeout(dbSaveTimer)
    dbSaveTimer = window.setTimeout(saveStateToDatabase, 180)
  }

  async function recordLog(action, detail, payload = {}) {
    const log = {
      id: uid('log'),
      action,
      detail,
      payload,
      createdAt: new Date().toISOString()
    }
    state.auditLogs = [log, ...(state.auditLogs || [])].slice(0, 300)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    if (dbReady && dbClient) {
      const { error } = await dbClient.from('kitchen_audit_logs').insert({
        action,
        detail,
        payload,
        created_at: log.createdAt
      })
      if (error) console.error(error)
    }
    saveState()
  }

  function money(value) {
    const number = Number(value || 0)
    return `￥${number.toFixed(number % 1 === 0 ? 0 : 1)}`
  }

  function showToast(message) {
    toast.textContent = message
    toast.hidden = false
    window.clearTimeout(showToast.timer)
    showToast.timer = window.setTimeout(() => {
      toast.hidden = true
    }, 2400)
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;')
  }

  function parseLines(raw, type) {
    return String(raw || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        if (type === 'name') return { name: line }
        const parts = line.split(/\s+/)
        return {
          name: parts[0] || '',
          amount: Number(parts[1] || 0),
          unit: parts[2] || ''
        }
      })
      .filter((item) => item.name)
  }

  function listToRaw(list, type) {
    return (list || []).map((item) => {
      if (type === 'name') return item.name
      return `${item.name} ${item.amount} ${item.unit}`
    }).join('\n')
  }

  function formatDate(value) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    const pad = (num) => String(num).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  }

  function recipeFor(dishId) {
    return state.recipes.find((recipe) => recipe.dishId === dishId)
  }

  function dishById(id) {
    return state.dishes.find((dish) => dish.id === id)
  }

  function findByName(list, name) {
    return (list || []).find((item) => item.name === name)
  }

  function canMakeDish(dish) {
    const recipe = recipeFor(dish.id)
    const missing = []
    if (!dish.isListed) missing.push('未上架')
    if (!recipe) missing.push('未配置配方')

    for (const item of (recipe && recipe.materials) || []) {
      const stock = findByName(state.materials, item.name)
      if (!stock || Number(stock.stock || 0) < Number(item.amount || 0)) {
        missing.push(`${item.name}不足`)
      }
    }
    for (const item of (recipe && recipe.seasonings) || []) {
      const stock = findByName(state.seasonings, item.name)
      if (!stock || Number(stock.stock || 0) < Number(item.amount || 0)) {
        missing.push(`${item.name}不足`)
      }
    }
    for (const item of (recipe && recipe.tools) || []) {
      const tool = findByName(state.tools, item.name)
      if (!tool || tool.status !== 'available' || Number(tool.count || 0) <= 0) {
        missing.push(`${item.name}不可用`)
      }
    }

    return {
      ok: missing.length === 0,
      missing
    }
  }

  function getAvailableDishes() {
    return state.dishes
      .map((dish) => ({ ...dish, availability: canMakeDish(dish) }))
      .filter((dish) => dish.availability.ok)
      .filter((dish) => {
        if (ui.customerCategory === '全部') return true
        if (ui.customerCategory === '她爱吃') return dish.isFavorite || (dish.tags || []).includes('她爱吃')
        return dish.category === ui.customerCategory
      })
  }

  function dishSearchText(dish) {
    return [dish.name, dish.category, dish.description].concat(dish.tags || []).join(' ').toLowerCase()
  }

  function applyCustomerSearchFilter() {
    const keyword = ui.keyword.trim().toLowerCase()
    const cards = Array.from(app.querySelectorAll('[data-dish-card]'))
    let visible = 0
    cards.forEach((card) => {
      const matched = !keyword || (card.dataset.search || '').includes(keyword)
      card.hidden = !matched
      if (matched) visible += 1
    })
    const empty = app.querySelector('[data-search-empty]')
    if (empty) empty.hidden = visible > 0 || !keyword
  }

  function adjustAmount(list, names, value, mode) {
    return (list || []).map((item) => {
      if (!names.includes(item.name)) return item
      const next = mode === 'set' ? value : Number(item.amount || 0) * value
      return { ...item, amount: Number(next.toFixed(2)) }
    })
  }

  function multiplyList(list, quantity) {
    return (list || []).map((item) => ({
      ...item,
      amount: Number((Number(item.amount || 0) * Number(quantity || 1)).toFixed(2))
    }))
  }

  function hasTaste(item, key, orderRemark) {
    return (item.tasteOptions || []).includes(key) || `${item.remark || ''} ${orderRemark || ''}`.includes(key)
  }

  function adjustedRecipeForItem(item, orderRemark) {
    const recipe = recipeFor(item.dishId)
    if (!recipe) return { materials: [], seasonings: [], tools: [], steps: [] }

    let materials = clone(recipe.materials || [])
    let seasonings = clone(recipe.seasonings || [])
    if (hasTaste(item, '少盐', orderRemark)) seasonings = adjustAmount(seasonings, ['盐'], 0.5, 'ratio')
    if (hasTaste(item, '少油', orderRemark)) seasonings = adjustAmount(seasonings, ['食用油', '大豆油', '油'], 0.7, 'ratio')
    if (hasTaste(item, '不放葱', orderRemark)) materials = adjustAmount(materials, ['葱', '小葱', '葱花'], 0, 'set')
    if (hasTaste(item, '不放蒜', orderRemark)) materials = adjustAmount(materials, ['蒜', '蒜瓣'], 0, 'set')
    if (hasTaste(item, '不辣', orderRemark)) seasonings = adjustAmount(seasonings, ['辣椒油', '辣椒面', '辣椒', '小米辣'], 0, 'set')

    return {
      materials: multiplyList(materials, item.quantity),
      seasonings: multiplyList(seasonings, item.quantity),
      tools: clone(recipe.tools || []),
      steps: clone(recipe.steps || [])
    }
  }

  function aggregateRequirements(items, orderRemark) {
    const materials = {}
    const seasonings = {}
    const tools = {}
    items.forEach((item) => {
      const recipe = adjustedRecipeForItem(item, orderRemark)
      recipe.materials.forEach((entry) => {
        materials[entry.name] = materials[entry.name] || { name: entry.name, amount: 0, unit: entry.unit }
        materials[entry.name].amount += Number(entry.amount || 0)
      })
      recipe.seasonings.forEach((entry) => {
        seasonings[entry.name] = seasonings[entry.name] || { name: entry.name, amount: 0, unit: entry.unit }
        seasonings[entry.name].amount += Number(entry.amount || 0)
      })
      recipe.tools.forEach((entry) => {
        tools[entry.name] = entry
      })
    })
    return {
      materials: Object.values(materials),
      seasonings: Object.values(seasonings),
      tools: Object.values(tools)
    }
  }

  function validateOrderAvailability(items, orderRemark) {
    const errors = []
    const requirements = aggregateRequirements(items, orderRemark)
    requirements.materials.forEach((entry) => {
      const stock = findByName(state.materials, entry.name)
      if (!stock || Number(stock.stock || 0) < Number(entry.amount || 0)) {
        errors.push(`${entry.name}不足，需要${entry.amount}${entry.unit}`)
      }
    })
    requirements.seasonings.forEach((entry) => {
      const stock = findByName(state.seasonings, entry.name)
      if (!stock || Number(stock.stock || 0) < Number(entry.amount || 0)) {
        errors.push(`${entry.name}不足，需要${entry.amount}${entry.unit}`)
      }
    })
    requirements.tools.forEach((entry) => {
      const tool = findByName(state.tools, entry.name)
      if (!tool || tool.status !== 'available' || Number(tool.count || 0) <= 0) {
        errors.push(`${entry.name}不可用`)
      }
    })
    return errors
  }

  function deductInventory(order) {
    const requirements = aggregateRequirements(order.items, order.remark)
    requirements.materials.forEach((entry) => {
      const stock = findByName(state.materials, entry.name)
      if (stock) stock.stock = Number((Number(stock.stock || 0) - Number(entry.amount || 0)).toFixed(2))
    })
    requirements.seasonings.forEach((entry) => {
      const stock = findByName(state.seasonings, entry.name)
      if (stock) stock.stock = Number((Number(stock.stock || 0) - Number(entry.amount || 0)).toFixed(2))
    })
  }

  function cartTotal() {
    return state.cart.items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0)
  }

  function cartCount() {
    return state.cart.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
  }

  function estimateTime(items) {
    const total = items.reduce((sum, item) => sum + Number(item.cookTime || 0) * Number(item.quantity || 1), 0)
    return Math.max(5, Math.ceil(total * 0.8))
  }

  function addToCart(form) {
    if (!requireDatabase('加入点菜单')) return
    const dish = dishById(form.dishId)
    if (!dish) return
    const key = `${form.dishId}::${form.tasteOptions.slice().sort().join('|')}::${form.remark}`
    const existing = state.cart.items.find((item) => item.key === key)
    if (existing) {
      existing.quantity += form.quantity
    } else {
      state.cart.items.push({
        key,
        dishId: dish.id,
        name: dish.name,
        price: dish.price,
        cookTime: dish.cookTime,
        imageUrl: dish.imageUrl,
        quantity: form.quantity,
        tasteOptions: form.tasteOptions,
        remark: form.remark
      })
    }
    saveState()
    recordLog('顾客加入点菜单', `${dish.name} × ${form.quantity}`, { dishId: dish.id, tasteOptions: form.tasteOptions, remark: form.remark })
    showToast('已加入点菜单')
    ui.modal = ''
    render()
  }

  function orderSummary(order) {
    return order.items.map((item) => {
      const taste = item.tasteOptions && item.tasteOptions.length ? `（${item.tasteOptions.join('、')}）` : ''
      const remark = item.remark ? `，备注：${item.remark}` : ''
      return `${item.name} × ${item.quantity}${taste}${remark}`
    }).join('\n')
  }

  function encodeOrder(order) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(order))))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replaceAll('=', '')
  }

  function decodeOrder(encoded) {
    const normalized = encoded.replaceAll('-', '+').replaceAll('_', '/')
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4)
    return JSON.parse(decodeURIComponent(escape(atob(padded))))
  }

  function importUrlFor(order) {
    const config = state.email || {}
    const base = (config.siteUrl || `${window.location.origin}${window.location.pathname}`).replace(/#.*$/, '')
    return `${base}#importOrder=${encodeURIComponent(encodeOrder(order))}`
  }

  async function sendOrderEmail(order) {
    const config = state.email || {}
    const toEmail = config.toEmail || 'mxinyu2003@163.com'
    const params = {
      to_email: toEmail,
      order_no: order.orderNo,
      order_summary: orderSummary(order),
      remark: order.remark || '无',
      expected_time: order.expectedTime || '现在就吃',
      total_price: money(order.totalPrice),
      created_at: formatDate(order.createdAt),
      import_url: importUrlFor(order)
    }

    if (config.enabled && window.emailjs && config.serviceId && config.templateId && config.publicKey) {
      window.emailjs.init({ publicKey: config.publicKey })
      await window.emailjs.send(config.serviceId, config.templateId, params)
      showToast('订单邮件已发送')
      return
    }

    const subject = encodeURIComponent(`新点菜单：${order.orderNo}`)
    const body = encodeURIComponent([
      '她刚刚提交了一份点菜单：',
      '',
      params.order_summary,
      '',
      `整单备注：${params.remark}`,
      `期望时间：${params.expected_time}`,
      `合计：${params.total_price}`,
      '',
      '点击下面链接导入到厨师工作台：',
      params.import_url
    ].join('\n'))
    window.location.href = `mailto:${encodeURIComponent(toEmail)}?subject=${subject}&body=${body}`
    showToast('未配置 EmailJS，已打开邮件客户端兜底')
  }

  async function submitOrder() {
    if (!requireDatabase('提交订单')) return
    if (!state.cart.items.length) {
      showToast('点菜单还是空的')
      return
    }
    const errors = validateOrderAvailability(state.cart.items, state.cart.remark)
    if (errors.length) {
      showToast(errors[0])
      return
    }
    const now = new Date().toISOString()
    const order = {
      id: uid('order'),
      orderNo: new Date().toISOString().replace(/\D/g, '').slice(0, 14),
      status: 'SUBMITTED',
      items: clone(state.cart.items),
      totalPrice: cartTotal(),
      remark: state.cart.remark,
      expectedTime: state.cart.expectedTime,
      createdAt: now,
      acceptedAt: '',
      startedAt: '',
      readyAt: '',
      finishedAt: '',
      cancelledAt: ''
    }
    state.orders.unshift(order)
    state.cart = { items: [], remark: '', expectedTime: '现在就吃', customExpectedAt: '', expectedMonth: '', expectedDay: '', expectedClock: '' }
    saveState()
    await recordLog('顾客提交订单', `订单 #${order.orderNo}`, { orderId: order.id, orderNo: order.orderNo, items: order.items })
    render()
    try {
      await sendOrderEmail(order)
    } catch (error) {
      console.error(error)
      showToast('邮件发送失败，请检查 EmailJS 配置')
    }
  }

  function updateOrderStatus(orderId, status) {
    if (!requireDatabase('更新订单状态')) return
    const order = state.orders.find((item) => item.id === orderId)
    if (!order) return
    if (status === 'COOKING') {
      const errors = validateOrderAvailability(order.items, order.remark)
      if (errors.length) {
        showToast(errors[0])
        return
      }
      order.startedAt = new Date().toISOString()
    }
    if (status === 'ACCEPTED') order.acceptedAt = new Date().toISOString()
    if (status === 'READY') {
      const errors = validateOrderAvailability(order.items, order.remark)
      if (errors.length) {
        showToast(errors[0])
        return
      }
      deductInventory(order)
      order.readyAt = new Date().toISOString()
    }
    if (status === 'FINISHED') order.finishedAt = new Date().toISOString()
    if (status === 'CANCELLED') order.cancelledAt = new Date().toISOString()
    order.status = status
    saveState()
    recordLog('厨师更新订单', `#${order.orderNo} -> ${STATUS_TEXT[status] || status}`, { orderId: order.id, status })
    showToast(STATUS_TEXT[status] || '状态已更新')
    render()
  }

  function importOrderFromHash() {
    const marker = '#importOrder='
    if (!window.location.hash.startsWith(marker)) return
    if (!requireDatabase('导入订单')) return
    try {
      const order = decodeOrder(decodeURIComponent(window.location.hash.slice(marker.length)))
      if (!state.orders.some((item) => item.id === order.id || item.orderNo === order.orderNo)) {
        state.orders.unshift(order)
        saveState()
        recordLog('厨师导入订单', `订单 #${order.orderNo}`, { orderId: order.id, orderNo: order.orderNo })
        showToast('订单已导入厨师工作台')
      }
      ui.view = 'chef'
      ui.selectedOrderId = order.id
      window.history.replaceState(null, '', window.location.pathname)
    } catch (error) {
      console.error(error)
      showToast('订单导入失败')
    }
  }

  function render() {
    document.querySelectorAll('.tab-btn').forEach((button) => {
      button.classList.toggle('active', button.dataset.view === ui.view)
    })
    if (ui.view === 'customer') renderCustomer()
    if (ui.view === 'chef') {
      if (chefUnlocked) renderChef()
      else renderChefLock()
    }
    if (ui.view === 'settings') renderSettings()
  }

  function renderCustomer() {
    const dishes = getAvailableDishes()
    const unavailable = state.dishes
      .map((dish) => ({ ...dish, availability: canMakeDish(dish) }))
      .filter((dish) => dish.isListed && !dish.availability.ok)

    app.innerHTML = `
      <section class="grid two">
        <div>
          <div class="panel">
            <h1 class="section-title">今天想吃什么？</h1>
            <p class="subtle">这里会根据当前库存和工具状态，只显示现在能做的菜。缺材料的菜在厨师端可以补库存后恢复。</p>
            <div class="toolbar">
              <input class="input" style="max-width: 320px" data-action="search" value="${escapeHtml(ui.keyword)}" placeholder="搜索菜名、分类或标签">
              ${CATEGORY_OPTIONS.map((item) => `<button class="mini-tab ${ui.customerCategory === item ? 'active' : ''}" data-action="category" data-category="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join('')}
            </div>
          </div>
          <div class="dish-grid" style="margin-top: 18px">
            ${dishes.map(renderDishCard).join('') || '<div class="panel empty">今天没有可点菜，去厨师端补库存吧。</div>'}
          </div>
          <div class="panel empty" data-search-empty hidden>没有找到匹配的菜。</div>
          ${unavailable.length ? `
            <div class="panel" style="margin-top: 18px">
              <h2 class="section-title">暂时做不了</h2>
              <div class="grid">
                ${unavailable.map((dish) => `<div class="order-line"><span>${escapeHtml(dish.name)}</span><span class="tag bad">${escapeHtml(dish.availability.missing[0])}</span></div>`).join('')}
              </div>
            </div>
          ` : ''}
        </div>
        <aside>${renderCart()}</aside>
      </section>
      ${['dishOrder', 'dishIntro'].includes(ui.modal) ? renderDishModal() : ''}
    `
    applyCustomerSearchFilter()
  }

  function renderDishCard(dish) {
    return `
      <article class="dish-card" data-dish-card data-search="${escapeHtml(dishSearchText(dish))}">
        <img class="dish-photo" src="${escapeHtml(dish.imageUrl)}" alt="${escapeHtml(dish.name)}" onerror="this.style.display='none'">
        <div class="dish-body">
          <div class="dish-title">
            <span>${escapeHtml(dish.name)}</span>
            <span class="price">${money(dish.price)}</span>
          </div>
          <p class="subtle">${escapeHtml(dish.description)}</p>
          <div class="tags">
            <span class="tag">${escapeHtml(dish.category)}</span>
            <span class="tag">约${dish.cookTime}分钟</span>
            ${(dish.tags || []).slice(0, 2).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
          </div>
          <div class="toolbar">
            <button class="btn" data-action="openDish" data-id="${dish.id}">点这道</button>
            <button class="btn ghost" data-action="showRecipe" data-id="${dish.id}">看介绍</button>
          </div>
        </div>
      </article>
    `
  }

  function twoDigit(value) {
    return String(value).padStart(2, '0')
  }

  function currentMonthDay() {
    const now = new Date()
    return {
      month: twoDigit(now.getMonth() + 1),
      day: twoDigit(now.getDate())
    }
  }

  function updateCustomExpectedTimeFromControls() {
    const month = document.getElementById('expectedMonth')?.value || ''
    const day = document.getElementById('expectedDay')?.value || ''
    const clock = document.getElementById('expectedClock')?.value || ''
    state.cart.expectedMonth = month
    state.cart.expectedDay = day
    state.cart.expectedClock = clock
    state.cart.customExpectedAt = [month, day, clock].filter(Boolean).join(' ')
    state.cart.expectedTime = month && day && clock ? `${Number(month)}月${Number(day)}日 ${clock}` : '具体时间待定'
  }

  function renderExpectedTimePicker() {
    const today = currentMonthDay()
    const month = state.cart.expectedMonth || today.month
    const day = state.cart.expectedDay || today.day
    const clock = state.cart.expectedClock || ''
    const monthOptions = Array.from({ length: 12 }, (_, index) => twoDigit(index + 1))
    const dayOptions = Array.from({ length: 31 }, (_, index) => twoDigit(index + 1))
    return `
      <div class="time-picker" aria-label="具体想几点吃">
        <label>
          <span>月</span>
          <select id="expectedMonth" class="select" data-action="expectedDatePart">
            ${monthOptions.map((item) => `<option value="${item}" ${item === month ? 'selected' : ''}>${Number(item)}月</option>`).join('')}
          </select>
        </label>
        <label>
          <span>日</span>
          <select id="expectedDay" class="select" data-action="expectedDatePart">
            ${dayOptions.map((item) => `<option value="${item}" ${item === day ? 'selected' : ''}>${Number(item)}日</option>`).join('')}
          </select>
        </label>
        <label>
          <span>时间</span>
          <input id="expectedClock" class="input" type="time" data-action="expectedDatePart" value="${escapeHtml(clock)}">
        </label>
      </div>
    `
  }

  function renderCart() {
    return `
      <div class="panel">
        <h2 class="section-title">我的点菜单</h2>
        <p class="subtle">已选 ${cartCount()} 份，预计 ${estimateTime(state.cart.items)} 分钟。</p>
        <div>
          ${state.cart.items.map((item) => `
            <div class="cart-line">
              <div>
                <strong>${escapeHtml(item.name)}</strong>
                <div class="subtle">${money(item.price)} · ${(item.tasteOptions || []).join('、') || '正常口味'}</div>
                ${item.remark ? `<div class="subtle">备注：${escapeHtml(item.remark)}</div>` : ''}
              </div>
              <div class="qty">
                <button class="btn small ghost" data-action="cartQty" data-key="${escapeHtml(item.key)}" data-delta="-1">-</button>
                <span>${item.quantity}</span>
                <button class="btn small" data-action="cartQty" data-key="${escapeHtml(item.key)}" data-delta="1">+</button>
              </div>
            </div>
          `).join('') || '<div class="empty">还没有点菜。</div>'}
        </div>
        <label class="subtle" for="cartRemark">整单备注</label>
        <textarea id="cartRemark" class="textarea" data-action="cartRemark" placeholder="例如：少盐，不放葱，想早点吃">${escapeHtml(state.cart.remark)}</textarea>
        <div class="toolbar">
          ${['现在就吃', '30分钟后', '今晚再吃'].map((item) => `<button class="mini-tab ${state.cart.expectedTime === item ? 'active' : ''}" data-action="expectedTime" data-time="${item}">${item}</button>`).join('')}
        </div>
        <label class="subtle">具体想几点吃</label>
        ${renderExpectedTimePicker()}
        <div class="cart-line">
          <strong>合计</strong>
          <strong class="price">${money(cartTotal())}</strong>
        </div>
        <button class="btn" style="width: 100%; margin-top: 12px" data-action="submitOrder">提交给他做</button>
      </div>
    `
  }

  function renderDishModal() {
    const dish = dishById(ui.selectedDishId)
    if (!dish) return ''
    const recipe = recipeFor(dish.id)
    const isIntro = ui.modal === 'dishIntro'
    return `
      <div class="modal-backdrop" data-action="closeModal">
        <div class="modal ${isIntro ? 'intro-modal' : ''}" role="dialog" aria-modal="true">
          <div class="modal-head">
            <div>
              <strong>${isIntro ? '菜品介绍' : '点这道'} · ${escapeHtml(dish.name)}</strong>
              <div class="subtle">${escapeHtml(dish.description)}</div>
            </div>
            <button class="btn small ghost" data-action="closeModal">关闭</button>
          </div>
          <div class="modal-body">
            <div class="grid two">
              <img class="dish-photo" src="${escapeHtml(dish.imageUrl)}" alt="${escapeHtml(dish.name)}">
              ${isIntro ? `
              <div class="intro-panel">
                <div class="dish-title">
                  <span>${escapeHtml(dish.name)}</span>
                  <span class="price">${money(dish.price)}</span>
                </div>
                <p class="subtle">${escapeHtml(dish.description)}</p>
                <div class="tags">
                  <span class="tag">${escapeHtml(dish.category)}</span>
                  <span class="tag">约 ${dish.cookTime} 分钟</span>
                  ${(dish.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
                </div>
              </div>
              ` : `
              <div>
                <div class="form-grid">
                  <label>数量<input class="input" id="dishQty" type="number" min="1" value="1"></label>
                  <label>备注<input class="input" id="dishRemark" placeholder="想吃酸一点"></label>
                </div>
                <div class="toolbar">
                  ${TASTE_OPTIONS.map((taste) => `<label class="tag"><input type="checkbox" name="taste" value="${taste}"> ${taste}</label>`).join('')}
                </div>
                <button class="btn" data-action="addSelectedDish" data-id="${dish.id}">加入点菜单</button>
              </div>
              `}
            </div>
            <div class="cook-card">
              <h4>${isIntro ? '详细介绍' : '顾客可见介绍'}</h4>
              <p class="subtle">${escapeHtml(dish.description)}</p>
              <h4>厨师配方概览</h4>
              <p class="subtle">${recipe ? recipe.materials.map((item) => `${item.name}${item.amount}${item.unit}`).join('、') : '未配置配方'}</p>
            </div>
          </div>
        </div>
      </div>
    `
  }

  function renderChefLock() {
    app.innerHTML = `
      <section class="chef-lock">
        <div class="panel lock-panel">
          <h1 class="section-title">厨师工作台</h1>
          <p class="subtle">请输入 Marshall 的厨师密码。</p>
          <div class="form-grid">
            <label class="full">密码<input id="chefPassword" class="input" type="password" data-action="chefPasswordInput" autocomplete="current-password" placeholder="输入密码进入"></label>
          </div>
          <div class="toolbar">
            <button class="btn" data-action="unlockChef">进入厨师工作台</button>
          </div>
        </div>
      </section>
    `
    const input = document.getElementById('chefPassword')
    if (input) input.focus()
  }

  function renderChef() {
    app.innerHTML = `
      <section class="panel">
        <h1 class="section-title">厨师工作台</h1>
        <p class="subtle">订单、库存、菜品、配方和图片都在这里维护。收到邮件后点导入链接，订单会进入此页面。</p>
        <div class="mini-tabs">
          ${[
            ['orders', '订单'],
            ['inventory', '库存'],
            ['dishes', '菜品和图片'],
            ['recipes', '配方'],
            ['logs', '记录']
          ].map(([key, label]) => `<button class="mini-tab ${ui.chefTab === key ? 'active' : ''}" data-action="chefTab" data-tab="${key}">${label}</button>`).join('')}
        </div>
      </section>
      <div style="margin-top: 18px">
        ${ui.chefTab === 'orders' ? renderChefOrders() : ''}
        ${ui.chefTab === 'inventory' ? renderInventory() : ''}
        ${ui.chefTab === 'dishes' ? renderDishAdmin() : ''}
        ${ui.chefTab === 'recipes' ? renderRecipeAdmin() : ''}
        ${ui.chefTab === 'logs' ? renderAuditLogs() : ''}
      </div>
    `
  }

  function renderChefOrders() {
    const counts = {
      submitted: state.orders.filter((order) => order.status === 'SUBMITTED').length,
      cooking: state.orders.filter((order) => order.status === 'COOKING').length,
      ready: state.orders.filter((order) => order.status === 'READY').length,
      finished: state.orders.filter((order) => order.status === 'FINISHED').length
    }
    const selected = state.orders.find((order) => order.id === ui.selectedOrderId) || state.orders[0]
    return `
      <div class="grid two">
        <div>
          <div class="stats">
            <div class="stat"><strong>${counts.submitted}</strong><span class="subtle">待接单</span></div>
            <div class="stat"><strong>${counts.cooking}</strong><span class="subtle">制作中</span></div>
            <div class="stat"><strong>${counts.ready}</strong><span class="subtle">可出餐</span></div>
            <div class="stat"><strong>${counts.finished}</strong><span class="subtle">已完成</span></div>
          </div>
          <div class="panel" style="margin-top: 18px">
            ${state.orders.map((order) => renderOrderLine(order)).join('') || '<div class="empty">还没有订单。顾客提交订单后会出现在这里。</div>'}
          </div>
        </div>
        <aside>${selected ? renderOrderDetail(selected) : '<div class="panel empty">请选择订单。</div>'}</aside>
      </div>
    `
  }

  function renderOrderLine(order) {
    return `
      <div class="order-line">
        <div>
          <strong>#${escapeHtml(order.orderNo)}</strong>
          <div class="subtle">${formatDate(order.createdAt)} · ${order.items.map((item) => `${item.name}×${item.quantity}`).join('，')}</div>
        </div>
        <button class="btn small ${ui.selectedOrderId === order.id ? '' : 'ghost'}" data-action="selectOrder" data-id="${order.id}">${STATUS_TEXT[order.status] || order.status}</button>
      </div>
    `
  }

  function renderOrderDetail(order) {
    const canProgress = !['READY', 'FINISHED', 'CANCELLED'].includes(order.status)
    return `
      <div class="panel">
        <h2 class="section-title">#${escapeHtml(order.orderNo)}</h2>
        <div class="status ${order.status === 'CANCELLED' ? 'bad' : ''}">${STATUS_TEXT[order.status]}</div>
        <p class="subtle">${formatDate(order.createdAt)} · ${escapeHtml(order.expectedTime || '现在就吃')}</p>
        ${order.items.map((item) => `
          <div class="cart-line">
            <div>
              <strong>${escapeHtml(item.name)} × ${item.quantity}</strong>
              <div class="subtle">${(item.tasteOptions || []).join('、') || '正常口味'}</div>
              ${item.remark ? `<div class="subtle">备注：${escapeHtml(item.remark)}</div>` : ''}
            </div>
            <span class="price">${money(item.price * item.quantity)}</span>
          </div>
        `).join('')}
        <p class="subtle">整单备注：${escapeHtml(order.remark || '无')}</p>
        <div class="cart-line"><strong>合计</strong><strong class="price">${money(order.totalPrice)}</strong></div>
        <div class="toolbar">
          ${order.status === 'SUBMITTED' ? `<button class="btn" data-action="orderStatus" data-id="${order.id}" data-status="ACCEPTED">接单</button>` : ''}
          ${['SUBMITTED', 'ACCEPTED'].includes(order.status) ? `<button class="btn secondary" data-action="orderStatus" data-id="${order.id}" data-status="COOKING">开始制作</button>` : ''}
          ${canProgress ? `<button class="btn" data-action="orderStatus" data-id="${order.id}" data-status="READY">完成出餐</button>` : ''}
          ${order.status === 'READY' ? `<button class="btn" data-action="orderStatus" data-id="${order.id}" data-status="FINISHED">标记吃完</button>` : ''}
          ${canProgress ? `<button class="btn danger" data-action="orderStatus" data-id="${order.id}" data-status="CANCELLED">取消</button>` : ''}
        </div>
        ${renderCookDetail(order)}
      </div>
    `
  }

  function renderCookDetail(order) {
    return `
      <div class="cook-card">
        <h3 class="section-title">做菜详情</h3>
        ${order.items.map((item) => {
          const recipe = adjustedRecipeForItem(item, order.remark)
          return `
            <div class="cook-card">
              <h4>${escapeHtml(item.name)} × ${item.quantity}</h4>
              <div class="subtle">备注：${escapeHtml([...(item.tasteOptions || []), item.remark || '', order.remark || ''].filter(Boolean).join('；') || '无')}</div>
              <div class="recipe-line"><strong>原材料</strong><span>${recipe.materials.map((entry) => `${entry.name}${entry.amount}${entry.unit}`).join('、') || '无'}</span></div>
              <div class="recipe-line"><strong>调味料</strong><span>${recipe.seasonings.map((entry) => `${entry.name}${entry.amount}${entry.unit}`).join('、') || '无'}</span></div>
              <div class="recipe-line"><strong>工具</strong><span>${recipe.tools.map((entry) => entry.name).join('、') || '无'}</span></div>
              <ol class="step-list">${recipe.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>
            </div>
          `
        }).join('')}
      </div>
    `
  }

  function materialGroupLabel(item) {
    const category = item.category || ''
    if (['肉类', '水产', '蛋类', '荤菜'].some((word) => category.includes(word))) return '荤菜'
    if (['主食', '米面', '杂粮'].some((word) => category.includes(word))) return '主食'
    if (['蔬菜', '菌菇', '素菜'].some((word) => category.includes(word))) return '素菜'
    return '其他'
  }

  function renderStockLine(item, active) {
    return `
      <div class="stock-line">
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <div class="subtle">${escapeHtml(item.category || item.status || '工具')} · 安全线 ${item.safeStock ?? 0}${item.unit || ''}</div>
        </div>
        <div class="qty">
          ${active === 'tools'
            ? `<span>${item.count} · ${item.status === 'available' ? '可用' : '不可用'}</span><button class="btn small ghost" data-action="toggleTool" data-id="${item.id}">${item.status === 'available' ? '停用' : '启用'}</button>`
            : `<button class="btn small ghost" data-action="stockDelta" data-type="${active}" data-id="${item.id}" data-delta="-1">-</button><strong>${item.stock}${item.unit}</strong><button class="btn small" data-action="stockDelta" data-type="${active}" data-id="${item.id}" data-delta="1">+</button>`
          }
        </div>
      </div>
    `
  }

  function renderInventoryList(list, active) {
    if (active !== 'materials') return list.map((item) => renderStockLine(item, active)).join('')
    const groups = ['素菜', '荤菜', '主食', '其他']
    return groups.map((group) => {
      const items = list.filter((item) => materialGroupLabel(item) === group)
      if (!items.length) return ''
      return `<div class="group-title">${group}</div>${items.map((item) => renderStockLine(item, active)).join('')}`
    }).join('')
  }

  function renderInventory() {
    const active = ui.inventoryTab
    const list = active === 'materials' ? state.materials : active === 'seasonings' ? state.seasonings : state.tools
    return `
      <div class="panel">
        <div class="mini-tabs">
          ${[
            ['materials', '原材料'],
            ['seasonings', '调配料'],
            ['tools', '工具']
          ].map(([key, label]) => `<button class="mini-tab ${active === key ? 'active' : ''}" data-action="inventoryTab" data-tab="${key}">${label}</button>`).join('')}
        </div>
        <div class="toolbar">
          <button class="btn ghost" data-action="addInventory">新增一项</button>
        </div>
        ${renderInventoryList(list, active)}
      </div>
    `
  }

  function renderDishAdmin() {
    const editing = state.dishes.find((dish) => dish.id === ui.editingDishId) || state.dishes[0]
    if (!ui.editingDishId && editing) ui.editingDishId = editing.id
    return `
      <div class="grid two">
        <div class="panel">
          <div class="toolbar"><button class="btn" data-action="newDish">新增菜品</button></div>
          ${state.dishes.map((dish) => `
            <div class="order-line">
              <div class="qty">
                <img class="image-preview" src="${escapeHtml(dish.imageUrl)}" alt="${escapeHtml(dish.name)}">
                <div><strong>${escapeHtml(dish.name)}</strong><div class="subtle">${dish.category} · ${money(dish.price)} · ${dish.isListed ? '已上架' : '已下架'}</div></div>
              </div>
              <button class="btn small ${ui.editingDishId === dish.id ? '' : 'ghost'}" data-action="editDish" data-id="${dish.id}">编辑</button>
            </div>
          `).join('')}
        </div>
        <aside>${editing ? renderDishForm(editing) : ''}</aside>
      </div>
    `
  }

  function getDishFlagDraft(dish) {
    if (!ui.dishFlagDrafts[dish.id]) {
      ui.dishFlagDrafts[dish.id] = {
        isListed: Boolean(dish.isListed),
        isFavorite: Boolean(dish.isFavorite)
      }
    }
    return ui.dishFlagDrafts[dish.id]
  }

  function renderDishForm(dish) {
    const flagDraft = getDishFlagDraft(dish)
    return `
      <div class="panel">
        <h2 class="section-title">菜品和图片</h2>
        <div class="form-grid">
          <label>菜名<input class="input" data-form="dish" data-field="name" value="${escapeHtml(dish.name)}"></label>
          <label>分类<input class="input" data-form="dish" data-field="category" value="${escapeHtml(dish.category)}"></label>
          <label>价格<input class="input" data-form="dish" data-field="price" type="number" value="${dish.price}"></label>
          <label>制作时间<input class="input" data-form="dish" data-field="cookTime" type="number" value="${dish.cookTime}"></label>
          <label class="full">图片地址<input class="input" data-form="dish" data-field="imageUrl" value="${escapeHtml(dish.imageUrl)}"></label>
          <label class="full">上传本地图片<input class="input" type="file" accept="image/*" data-action="uploadDishImage" data-id="${dish.id}"></label>
          <label class="full">菜品标签<input class="input" data-form="dishTags" value="${escapeHtml((dish.tags || []).join('，'))}" placeholder="例如：下饭，少油，快手"></label>
          <label class="full">简介<textarea class="textarea" data-form="dish" data-field="description">${escapeHtml(dish.description)}</textarea></label>
        </div>
        <div class="toolbar">
          <label class="tag"><input type="checkbox" data-action="toggleDishBool" data-id="${dish.id}" data-field="isListed" ${flagDraft.isListed ? 'checked' : ''}> 上架</label>
          <label class="tag"><input type="checkbox" data-action="toggleDishBool" data-id="${dish.id}" data-field="isFavorite" ${flagDraft.isFavorite ? 'checked' : ''}> 她爱吃</label>
          <button class="btn small" data-action="confirmDishFlags" data-id="${dish.id}">确定状态</button>
          <button class="btn small danger" data-action="deleteDish" data-id="${dish.id}">删除菜品</button>
        </div>
        <p class="subtle">永久图片可以放到 <code>assets/dishes/</code> 或 <code>assets/uploads/</code>，再把相对路径填到图片地址。网页内上传会写入当前数据库状态。</p>
      </div>
    `
  }

  function renderRecipeAdmin() {
    const dish = state.dishes.find((item) => item.id === ui.editingDishId) || state.dishes[0]
    if (!dish) return '<div class="panel empty">还没有菜品。</div>'
    const recipe = recipeFor(dish.id) || { materials: [], seasonings: [], tools: [], steps: [] }
    return `
      <div class="grid two">
        <div class="panel">
          ${state.dishes.map((item) => `<div class="order-line"><span>${escapeHtml(item.name)}</span><button class="btn small ${dish.id === item.id ? '' : 'ghost'}" data-action="editDish" data-id="${item.id}">编辑配方</button></div>`).join('')}
        </div>
        <aside class="panel">
          <h2 class="section-title">${escapeHtml(dish.name)} 配方</h2>
          <label class="subtle">原材料，每行：名称 数量 单位</label>
          <textarea class="textarea" data-form="recipe" data-field="materials">${escapeHtml(listToRaw(recipe.materials, 'amount'))}</textarea>
          <label class="subtle">调配料，每行：名称 数量 单位</label>
          <textarea class="textarea" data-form="recipe" data-field="seasonings">${escapeHtml(listToRaw(recipe.seasonings, 'amount'))}</textarea>
          <label class="subtle">工具，每行一个名称</label>
          <textarea class="textarea" data-form="recipe" data-field="tools">${escapeHtml(listToRaw(recipe.tools, 'name'))}</textarea>
          <label class="subtle">步骤，每行一步</label>
          <textarea class="textarea" data-form="recipe" data-field="steps">${escapeHtml((recipe.steps || []).join('\n'))}</textarea>
        </aside>
      </div>
    `
  }

  function renderAuditLogs() {
    const logs = (state.auditLogs || []).slice(0, 120)
    return `
      <div class="panel">
        <h2 class="section-title">操作记录</h2>
        <p class="subtle">这里保留顾客点菜、厨师接单、库存调整、菜品新增/删除/上下架、配方保存等关键记录。</p>
        ${logs.map((log) => `
          <div class="log-line">
            <div class="subtle">${formatDate(log.createdAt)}</div>
            <div>
              <strong>${escapeHtml(log.action)}</strong>
              <div class="subtle">${escapeHtml(log.detail || '')}</div>
            </div>
          </div>
        `).join('') || '<div class="empty">还没有记录。</div>'}
      </div>
    `
  }

  function renderDatabaseStatus() {
    const statusText = dbLoading
      ? '正在连接数据库'
      : dbReady
        ? 'Supabase 已连接，操作会同步到数据库'
        : dbMessage
    return `
      <div class="db-banner">
        <strong>数据库状态</strong>
        <div class="status ${dbReady ? '' : 'warn'}">${escapeHtml(statusText)}</div>
        <p class="subtle">配置文件：<code>config/supabase-config.js</code>。建表步骤见 <code>docs/supabase.md</code>。</p>
      </div>
    `
  }

  function renderSettings() {
    const config = state.email
    return `
      <section class="grid two">
        <div class="panel">
          <h1 class="section-title">邮件和部署设置</h1>
          <p class="subtle">GitHub Pages 是静态网站，不能直接保存服务器数据或安全发送 SMTP。这里使用 EmailJS 发送邮件；未配置时会自动打开系统邮件客户端兜底。</p>
          <div class="form-grid">
            <label>收件邮箱<input class="input" data-form="email" data-field="toEmail" value="${escapeHtml(config.toEmail)}"></label>
            <label>网站地址<input class="input" data-form="email" data-field="siteUrl" value="${escapeHtml(config.siteUrl)}" placeholder="https://你的用户名.github.io/项目名/"></label>
            <label>Service ID<input class="input" data-form="email" data-field="serviceId" value="${escapeHtml(config.serviceId)}"></label>
            <label>Template ID<input class="input" data-form="email" data-field="templateId" value="${escapeHtml(config.templateId)}"></label>
            <label class="full">Public Key<input class="input" data-form="email" data-field="publicKey" value="${escapeHtml(config.publicKey)}"></label>
          </div>
          <div class="toolbar">
            <label class="tag"><input type="checkbox" data-action="toggleEmailEnabled" ${config.enabled ? 'checked' : ''}> 启用 EmailJS 直接发送</label>
            <button class="btn ghost" data-action="testEmail">测试邮件</button>
          </div>
        </div>
        <aside class="panel">
          <h2 class="section-title">数据维护</h2>
          ${renderDatabaseStatus()}
          <p class="subtle">网站部署到 GitHub Pages 后，订单、购物车、库存、菜品和操作记录通过 Supabase 同步。localStorage 只作为本机预览缓存。</p>
          <div class="toolbar">
            <button class="btn ghost" data-action="exportData">导出数据</button>
            <button class="btn secondary" data-action="resetData">恢复初始数据</button>
          </div>
          <textarea class="textarea" readonly>${escapeHtml(JSON.stringify(state, null, 2))}</textarea>
        </aside>
      </section>
    `
  }

  function addInventoryItem() {
    if (!requireDatabase('新增库存项')) return
    const name = window.prompt('名称')
    if (!name) return
    if (ui.inventoryTab === 'tools') {
      state.tools.push({ id: uid('tool'), name, count: 1, status: 'available' })
    } else {
      const unit = window.prompt('单位', ui.inventoryTab === 'materials' ? 'g' : 'ml') || ''
      const stock = Number(window.prompt('当前库存', '1') || 0)
      const item = { id: uid(ui.inventoryTab === 'materials' ? 'mat' : 'sea'), name, category: '自定义', stock, unit, safeStock: 0, isAvailable: true }
      if (ui.inventoryTab === 'materials') state.materials.push(item)
      if (ui.inventoryTab === 'seasonings') state.seasonings.push(item)
    }
    saveState()
    recordLog('厨师新增库存项', name, { inventoryTab: ui.inventoryTab })
    render()
  }

  function createNewDish() {
    if (!requireDatabase('新增菜品')) return
    const dish = {
      id: uid('dish'),
      name: '新菜品',
      category: '家常菜',
      price: 18,
      costPrice: 0,
      cookTime: 10,
      emoji: '🍳',
      imageUrl: 'assets/dishes/egg-fried-rice.jpg',
      description: '新菜品简介',
      tags: [],
      isFavorite: false,
      isListed: false
    }
    state.dishes.unshift(dish)
    state.recipes.push({ id: uid('recipe'), dishId: dish.id, materials: [], seasonings: [], tools: [], steps: [] })
    ui.editingDishId = dish.id
    ui.dishFlagDrafts[dish.id] = { isListed: dish.isListed, isFavorite: dish.isFavorite }
    saveState()
    recordLog('厨师新增菜品', dish.name, { dishId: dish.id })
    render()
  }

  function deleteDish(dishId) {
    if (!requireDatabase('删除菜品')) return
    const dish = dishById(dishId)
    if (!dish) return
    if (!window.confirm(`确定删除「${dish.name}」吗？相关配方也会删除。`)) return
    state.dishes = state.dishes.filter((item) => item.id !== dishId)
    state.recipes = state.recipes.filter((item) => item.dishId !== dishId)
    state.cart.items = state.cart.items.filter((item) => item.dishId !== dishId)
    delete ui.dishFlagDrafts[dishId]
    ui.editingDishId = state.dishes[0] ? state.dishes[0].id : ''
    saveState()
    recordLog('厨师删除菜品', dish.name, { dishId })
    render()
  }

  function updateRecipeField(field, value) {
    const dish = dishById(ui.editingDishId)
    if (!dish) return
    let recipe = recipeFor(dish.id)
    if (!recipe) {
      recipe = { id: uid('recipe'), dishId: dish.id, materials: [], seasonings: [], tools: [], steps: [] }
      state.recipes.push(recipe)
    }
    if (field === 'materials') recipe.materials = parseLines(value, 'amount')
    if (field === 'seasonings') recipe.seasonings = parseLines(value, 'amount')
    if (field === 'tools') recipe.tools = parseLines(value, 'name')
    if (field === 'steps') recipe.steps = String(value || '').split('\n').map((line) => line.trim()).filter(Boolean)
    saveState()
  }

  function handleInput(event) {
    const target = event.target
    if (target.dataset.action === 'search') {
      ui.keyword = target.value
      applyCustomerSearchFilter()
      return
    }
    if (target.dataset.action === 'cartRemark') {
      if (!requireDatabase('保存点菜单备注')) return
      state.cart.remark = target.value
      saveState()
      return
    }
    if (target.dataset.action === 'expectedDatePart') {
      if (!requireDatabase('保存就餐时间')) return
      updateCustomExpectedTimeFromControls()
      saveState()
      return
    }
    if (target.dataset.form === 'dish') {
      if (!requireDatabase('编辑菜品')) return
      const dish = dishById(ui.editingDishId)
      if (!dish) return
      const field = target.dataset.field
      dish[field] = ['price', 'cookTime'].includes(field) ? Number(target.value || 0) : target.value
      saveState()
      if (event.type === 'change') recordLog('厨师编辑菜品', `${dish.name} 更新 ${field}`, { dishId: dish.id, field, value: dish[field] })
      return
    }
    if (target.dataset.form === 'dishTags') {
      if (!requireDatabase('编辑菜品标签')) return
      const dish = dishById(ui.editingDishId)
      if (!dish) return
      dish.tags = String(target.value || '').split(/[，,\s]+/).map((tag) => tag.trim()).filter(Boolean)
      saveState()
      if (event.type === 'change') recordLog('厨师编辑菜品标签', `${dish.name}：${dish.tags.join('、') || '无标签'}`, { dishId: dish.id, tags: dish.tags })
      return
    }
    if (target.dataset.form === 'email') {
      state.email[target.dataset.field] = target.value
      saveState()
      return
    }
    if (target.dataset.form === 'recipe') {
      if (!requireDatabase('编辑配方')) return
      updateRecipeField(target.dataset.field, target.value)
      if (event.type === 'change') {
        const dish = dishById(ui.editingDishId)
        if (dish) recordLog('厨师编辑配方', `${dish.name} 更新 ${target.dataset.field}`, { dishId: dish.id, field: target.dataset.field })
      }
      return
    }
    if (target.dataset.action === 'uploadDishImage') {
      if (!requireDatabase('上传菜品图片')) return
      const file = target.files && target.files[0]
      const dish = dishById(target.dataset.id)
      if (!file || !dish) return
      const reader = new FileReader()
      reader.onload = () => {
        dish.imageUrl = reader.result
        saveState()
        recordLog('厨师上传菜品图片', dish.name, { dishId: dish.id })
        showToast('图片已保存到数据库状态')
        render()
      }
      reader.readAsDataURL(file)
    }
  }

  function handleClick(event) {
    const target = event.target.closest('[data-action]')
    if (!target) return
    const action = target.dataset.action

    if (action === 'category') {
      ui.customerCategory = target.dataset.category
      render()
    }
    if (action === 'openDish' || action === 'showRecipe') {
      ui.selectedDishId = target.dataset.id
      ui.modal = action === 'showRecipe' ? 'dishIntro' : 'dishOrder'
      render()
    }
    if (action === 'closeModal') {
      const clickedBackdrop = target.classList.contains('modal-backdrop') && event.target === target
      const clickedCloseButton = Boolean(event.target.closest('button[data-action="closeModal"]'))
      if (!clickedBackdrop && !clickedCloseButton) return
      ui.modal = ''
      render()
    }
    if (action === 'addSelectedDish') {
      const tastes = Array.from(document.querySelectorAll('input[name="taste"]:checked')).map((input) => input.value)
      addToCart({
        dishId: target.dataset.id,
        quantity: Math.max(1, Number(document.getElementById('dishQty').value || 1)),
        tasteOptions: tastes,
        remark: document.getElementById('dishRemark').value || ''
      })
    }
    if (action === 'cartQty') {
      if (!requireDatabase('修改点菜单')) return
      const item = state.cart.items.find((entry) => entry.key === target.dataset.key)
      if (!item) return
      item.quantity += Number(target.dataset.delta)
      state.cart.items = state.cart.items.filter((entry) => entry.quantity > 0)
      saveState()
      render()
    }
    if (action === 'expectedTime') {
      if (!requireDatabase('保存就餐时间')) return
      state.cart.expectedTime = target.dataset.time
      state.cart.customExpectedAt = ''
      state.cart.expectedMonth = ''
      state.cart.expectedDay = ''
      state.cart.expectedClock = ''
      saveState()
      render()
    }
    if (action === 'submitOrder') submitOrder()
    if (action === 'unlockChef') {
      const password = document.getElementById('chefPassword')?.value || ''
      if (password !== CHEF_PASSWORD) {
        showToast('密码不对')
        return
      }
      chefUnlocked = true
      sessionStorage.setItem('privateKitchenChefUnlocked', 'true')
      showToast('厨师工作台已解锁')
      render()
    }
    if (action === 'chefTab') {
      ui.chefTab = target.dataset.tab
      render()
    }
    if (action === 'selectOrder') {
      ui.selectedOrderId = target.dataset.id
      render()
    }
    if (action === 'orderStatus') updateOrderStatus(target.dataset.id, target.dataset.status)
    if (action === 'inventoryTab') {
      ui.inventoryTab = target.dataset.tab
      render()
    }
    if (action === 'stockDelta') {
      if (!requireDatabase('调整库存')) return
      const list = target.dataset.type === 'materials' ? state.materials : state.seasonings
      const item = list.find((entry) => entry.id === target.dataset.id)
      if (item) item.stock = Math.max(0, Number(item.stock || 0) + Number(target.dataset.delta))
      saveState()
      if (item) recordLog('厨师调整库存', `${item.name} ${target.dataset.delta > 0 ? '+' : ''}${target.dataset.delta}${item.unit || ''}`, { type: target.dataset.type, id: item.id, stock: item.stock })
      render()
    }
    if (action === 'toggleTool') {
      if (!requireDatabase('调整工具状态')) return
      const tool = state.tools.find((entry) => entry.id === target.dataset.id)
      if (tool) tool.status = tool.status === 'available' ? 'unavailable' : 'available'
      saveState()
      if (tool) recordLog('厨师调整工具状态', `${tool.name} -> ${tool.status === 'available' ? '可用' : '不可用'}`, { toolId: tool.id, status: tool.status })
      render()
    }
    if (action === 'addInventory') addInventoryItem()
    if (action === 'newDish') createNewDish()
    if (action === 'editDish') {
      ui.editingDishId = target.dataset.id
      render()
    }
    if (action === 'toggleDishBool') {
      const dish = dishById(target.dataset.id)
      if (!dish) return
      const draft = getDishFlagDraft(dish)
      draft[target.dataset.field] = target.checked
      render()
    }
    if (action === 'confirmDishFlags') {
      if (!requireDatabase('确认菜品状态')) return
      const dish = dishById(target.dataset.id)
      if (!dish) return
      const draft = getDishFlagDraft(dish)
      dish.isListed = Boolean(draft.isListed)
      dish.isFavorite = Boolean(draft.isFavorite)
      saveState()
      recordLog('厨师确认菜品状态', `${dish.name}：${dish.isListed ? '上架' : '下架'}，${dish.isFavorite ? '她爱吃' : '普通'}`, { dishId: dish.id, isListed: dish.isListed, isFavorite: dish.isFavorite })
      showToast('菜品状态已同步到顾客端')
      render()
    }
    if (action === 'deleteDish') deleteDish(target.dataset.id)
    if (action === 'toggleEmailEnabled') {
      state.email.enabled = target.checked
      saveState()
    }
    if (action === 'testEmail') {
      const order = {
        id: uid('test'),
        orderNo: 'TEST' + Date.now(),
        status: 'SUBMITTED',
        items: [{ name: '测试菜品', quantity: 1, price: 1, tasteOptions: ['少盐'], remark: '这是一封测试邮件' }],
        totalPrice: 1,
        remark: '测试邮件',
        expectedTime: '现在就吃',
        createdAt: new Date().toISOString()
      }
      sendOrderEmail(order).catch((error) => {
        console.error(error)
        showToast('测试邮件失败')
      })
    }
    if (action === 'exportData') {
      navigator.clipboard.writeText(JSON.stringify(state, null, 2))
      showToast('数据已复制到剪贴板')
    }
    if (action === 'resetData') {
      if (!requireDatabase('恢复初始数据')) return
      if (!window.confirm('确定恢复初始数据吗？当前浏览器里的订单和修改会被清空。')) return
      localStorage.removeItem(STORAGE_KEY)
      state = freshState()
      saveState()
      recordLog('厨师恢复初始数据', '已恢复到项目内置初始数据', {})
      render()
    }
  }

  function handleKeydown(event) {
    if (event.key === 'Enter' && event.target && event.target.id === 'chefPassword') {
      event.preventDefault()
      const button = app.querySelector('[data-action="unlockChef"]')
      if (button) button.click()
    }
  }

  document.querySelector('.top-tabs').addEventListener('click', (event) => {
    const button = event.target.closest('[data-view]')
    if (!button) return
    ui.view = button.dataset.view
    render()
  })
  app.addEventListener('input', handleInput)
  app.addEventListener('change', handleInput)
  app.addEventListener('click', handleClick)
  app.addEventListener('keydown', handleKeydown)

  async function boot() {
    initDatabase()
    if (dbClient) {
      try {
        await loadStateFromDatabase()
        dbReady = true
        dbMessage = 'Supabase 已连接'
      } catch (error) {
        console.error(error)
        dbReady = false
        dbMessage = '数据库连接失败，请检查 Supabase URL、anon key、表结构和 RLS 策略'
      }
    }
    dbLoading = false
    importOrderFromHash()
    render()
  }

  boot()
})()
