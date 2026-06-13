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
  const FAVORITE_TAG = 'Lucy最爱'
  const LEGACY_FAVORITE_TAG = '她爱吃'
  const DISH_TAG_OPTIONS = [FAVORITE_TAG, '家常菜', '主食', '素菜', '蒸菜', '汤', '凉菜']
  const CATEGORY_OPTIONS = ['全部', ...DISH_TAG_OPTIONS]
  const DB_CONFIG = window.KITCHEN_SUPABASE_CONFIG || {}
  const CHEF_PASSWORD = 'zazll'
  const SETTINGS_PASSWORD = 'zazll1'
  const CUSTOMER_USERNAME = 'Lucy'
  const CUSTOMER_PASSWORD = 'zamxy'
  const AI_STORAGE_KEY = 'privateKitchenAiConfig'
  const DISH_IMAGE_MAX_SIDE = 900
  const DISH_IMAGE_MAX_DATA_URL_LENGTH = 280000
  const DEFAULT_AI_CONFIG = {
    provider: 'deepseek',
    apiKey: '',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash'
  }
  const DEFAULT_REQUIRED_MATERIALS = {
    dish_cola_chicken_wings: ['鸡翅中'],
    dish_potato_pork: ['土豆', '猪肉'],
    dish_egg_fried_rice: ['大米', '鸡蛋'],
    dish_crystal_shrimp: ['虾滑'],
    dish_potato_chicken: ['土豆', '鸡肉'],
    dish_sweet_sour_cabbage: ['娃娃菜'],
    dish_steamed_sea_bass: ['鲈鱼']
  }
  const AI_SYSTEM_PROMPT = '你是家用点菜系统的菜谱JSON生成器。只输出合法json，不要解释。字段：dish{name,category,price,cookTime,description,tags,requiredMaterials};recipe{materials[{name,amount,unit}],seasonings[{name,amount,unit}],tools[{name}],steps[]}。主材料只放核心食材，调料不算主材料。名称尽量匹配给定库存。示例json:{"dish":{"name":"番茄炒蛋","category":"家常菜","price":16,"cookTime":12,"description":"酸甜下饭","tags":["家常菜"],"requiredMaterials":["鸡蛋"]},"recipe":{"materials":[{"name":"鸡蛋","amount":2,"unit":"个"}],"seasonings":[{"name":"盐","amount":2,"unit":"g"}],"tools":[{"name":"炒锅"}],"steps":["打蛋","炒熟"]}}'

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
    dishFlagDrafts: {},
    aiDishName: '',
    aiDishDraft: null,
    aiLoading: false,
    aiConfigOpen: false,
    inventoryDraft: null,
    logKeyword: '',
    logDate: '',
    showStateSnapshot: false
  }

  let state = loadState()
  let dbClient = null
  let dbReady = false
  let dbLoading = true
  let dbMessage = ''
  let dbSaveTimer = null
  let localSaveTimer = null
  let lastDbWarningAt = 0
  const dishTagLogTimers = new Map()
  let chefUnlocked = sessionStorage.getItem('privateKitchenChefUnlocked') === 'true'
  let customerUnlocked = sessionStorage.getItem('privateKitchenCustomerUnlocked') === 'true'
  let settingsUnlocked = sessionStorage.getItem('privateKitchenSettingsUnlocked') === 'true'
  let aiConfig = loadAiConfig()

  function clone(value) {
    return JSON.parse(JSON.stringify(value))
  }

  function uid(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
  }

  function parseNameList(raw) {
    if (Array.isArray(raw)) return raw.map((item) => String(item || '').trim()).filter(Boolean)
    return String(raw || '').split(/[，,\s]+/).map((item) => item.trim()).filter(Boolean)
  }

  function uniqueNames(list) {
    return Array.from(new Set(parseNameList(list)))
  }

  function normalizeDishTag(tag) {
    return tag === LEGACY_FAVORITE_TAG ? FAVORITE_TAG : tag
  }

  function displayTags(tags) {
    return uniqueNames((tags || []).map(normalizeDishTag))
  }

  function dishHasTag(dish, tag) {
    const tags = displayTags(dish.tags || [])
    return tags.includes(tag) || (tag === FAVORITE_TAG && Boolean(dish.isFavorite))
  }

  function uniqueTagEntries(entries) {
    const seen = new Set()
    return entries.filter((entry) => {
      const label = String(entry.label || '').trim()
      if (!label || seen.has(label)) return false
      seen.add(label)
      return true
    })
  }

  function dishTagEntries(dish, options = {}) {
    const maxMaterials = options.maxMaterials ?? 2
    const maxDishTags = options.maxDishTags ?? 2
    const entries = [
      { label: dish.category, className: '', source: 'category' },
      { label: `约${dish.cookTime}分钟`, className: '', source: 'meta' }
    ]
    if (dish.availability && dish.availability.partial) entries.push({ label: '缺少部分材料', className: 'warn', source: 'meta' })
    uniqueNames(dish.requiredMaterials || []).slice(0, maxMaterials).forEach((item) => {
      entries.push({ label: item, className: 'material-tag', source: 'material' })
    })
    displayTags(dish.tags || []).forEach((tag) => {
      entries.push({ label: tag, className: '', source: 'dishTag' })
    })
    const uniqueEntries = uniqueTagEntries(entries)
    let dishTagCount = 0
    return uniqueEntries.filter((entry) => {
      if (entry.source !== 'dishTag') return true
      dishTagCount += 1
      return dishTagCount <= maxDishTags
    })
  }

  function renderDishTags(dish, options) {
    return dishTagEntries(dish, options)
      .map((entry) => `<span class="tag ${entry.className || ''}">${escapeHtml(entry.label)}</span>`)
      .join('')
  }

  function defaultRequiredMaterialsFor(dish, recipes) {
    if (DEFAULT_REQUIRED_MATERIALS[dish.id]) return DEFAULT_REQUIRED_MATERIALS[dish.id]
    const recipe = (recipes || []).find((item) => item.dishId === dish.id)
    return (recipe && recipe.materials && recipe.materials[0]) ? [recipe.materials[0].name] : []
  }

  function normalizeState(data) {
    const recipes = data.recipes || []
    data.dishes = (data.dishes || []).map((dish) => ({
      ...dish,
      isFavorite: Boolean(dish.isFavorite || (dish.tags || []).includes(LEGACY_FAVORITE_TAG)),
      tags: displayTags(dish.tags || []),
      requiredMaterials: uniqueNames((dish.requiredMaterials && dish.requiredMaterials.length) ? dish.requiredMaterials : defaultRequiredMaterialsFor(dish, recipes))
    }))
    return data
  }

  function loadAiConfig() {
    const saved = localStorage.getItem(AI_STORAGE_KEY)
    if (!saved) return { ...DEFAULT_AI_CONFIG }
    try {
      return { ...DEFAULT_AI_CONFIG, ...JSON.parse(saved) }
    } catch (error) {
      console.warn('Cannot parse AI config, fallback to default.', error)
      return { ...DEFAULT_AI_CONFIG }
    }
  }

  function saveAiConfig() {
    localStorage.setItem(AI_STORAGE_KEY, JSON.stringify(aiConfig))
  }

  function loadState() {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        return normalizeState({
          ...freshState(),
          ...parsed,
          cart: {
            ...freshState().cart,
            ...(parsed.cart || {})
          },
          email: mergeEmailConfig(parsed.email)
        })
      } catch (error) {
        console.warn('Cannot parse saved state, fallback to seed.', error)
      }
    }
    return normalizeState(freshState())
  }

  function freshState() {
    const seed = clone(window.KITCHEN_SEED || {})
    const emailConfig = window.KITCHEN_EMAIL_CONFIG || {}
    return normalizeState({
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
    })
  }

  function mergeEmailConfig(savedEmail = {}) {
    const defaults = freshState().email
    return {
      ...defaults,
      ...savedEmail,
      enabled: defaults.enabled || Boolean(savedEmail.enabled),
      serviceId: defaults.serviceId || savedEmail.serviceId || '',
      templateId: defaults.templateId || savedEmail.templateId || '',
      publicKey: defaults.publicKey || savedEmail.publicKey || '',
      toEmail: defaults.toEmail || savedEmail.toEmail || 'mxinyu2003@163.com',
      siteUrl: defaults.siteUrl || savedEmail.siteUrl || ''
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
      state = normalizeState({
        ...freshState(),
        ...data.data,
        cart: {
          ...freshState().cart,
          ...(data.data.cart || {})
        },
        email: mergeEmailConfig(data.data.email)
      })
      await syncLogsFromDatabase()
      safeCacheState()
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

  function safeCacheState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      return true
    } catch (error) {
      console.warn('Cannot cache full state locally. Database save will still continue.', error)
      showToast('本机缓存空间不足，已继续同步数据库')
      return false
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
      return false
    }
    return true
  }

  function saveState(options = {}) {
    const { cacheDelay = 0, dbDelay = 180 } = options
    window.clearTimeout(localSaveTimer)
    if (cacheDelay > 0) {
      localSaveTimer = window.setTimeout(safeCacheState, cacheDelay)
    } else {
      safeCacheState()
    }
    if (!dbReady) return
    window.clearTimeout(dbSaveTimer)
    if (dbDelay <= 0) {
      void saveStateToDatabase()
      return
    }
    dbSaveTimer = window.setTimeout(saveStateToDatabase, dbDelay)
  }

  async function persistStateNow() {
    window.clearTimeout(localSaveTimer)
    window.clearTimeout(dbSaveTimer)
    safeCacheState()
    if (!dbReady || !dbClient) return false
    return Boolean(await saveStateToDatabase())
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
    safeCacheState()
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

  function loadImageElement(src) {
    return new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('图片读取失败'))
      image.src = src
    })
  }

  function drawCompressedImage(image, maxSide, quality) {
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height))
    const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale))
    const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    context.fillStyle = '#fffaf2'
    context.fillRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)
    return canvas.toDataURL('image/jpeg', quality)
  }

  async function compressDishImage(file) {
    if (!file || !file.type || !file.type.startsWith('image/')) {
      throw new Error('请选择图片文件')
    }
    const objectUrl = URL.createObjectURL(file)
    try {
      const image = await loadImageElement(objectUrl)
      let maxSide = DISH_IMAGE_MAX_SIDE
      let quality = 0.82
      let dataUrl = drawCompressedImage(image, maxSide, quality)
      while (dataUrl.length > DISH_IMAGE_MAX_DATA_URL_LENGTH && (quality > 0.56 || maxSide > 560)) {
        if (quality > 0.56) {
          quality = Math.max(0.56, quality - 0.08)
        } else {
          maxSide = Math.max(560, Math.round(maxSide * 0.82))
          quality = 0.76
        }
        dataUrl = drawCompressedImage(image, maxSide, quality)
      }
      return dataUrl
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  }

  async function compactStoredDishImages() {
    const oversized = (state.dishes || []).filter((dish) => (
      typeof dish.imageUrl === 'string' &&
      dish.imageUrl.startsWith('data:image/') &&
      dish.imageUrl.length > DISH_IMAGE_MAX_DATA_URL_LENGTH
    ))
    if (!oversized.length) return
    try {
      for (const dish of oversized) {
        const image = await loadImageElement(dish.imageUrl)
        dish.imageUrl = drawCompressedImage(image, DISH_IMAGE_MAX_SIDE, 0.78)
      }
      await persistStateNow()
      recordLog('系统压缩菜品图片', `已优化 ${oversized.length} 张菜品图片`, { count: oversized.length })
      render()
    } catch (error) {
      console.warn('Cannot compact stored dish images.', error)
    }
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

  function dateKey(value) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    const pad = (num) => String(num).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
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

  function stockHasAny(name) {
    const stock = findByName(state.materials, name)
    return Boolean(stock && Number(stock.stock || 0) > 0)
  }

  function canMakeDish(dish) {
    const recipe = recipeFor(dish.id)
    const hardMissing = []
    const partialMissing = []
    if (!dish.isListed) hardMissing.push('未上架')
    if (!recipe) hardMissing.push('未配置配方')

    const requiredMaterials = uniqueNames(dish.requiredMaterials || [])
    if (requiredMaterials.length && !requiredMaterials.some(stockHasAny)) {
      hardMissing.push(`${requiredMaterials.join(' / ')}暂无库存`)
    }

    for (const item of (recipe && recipe.materials) || []) {
      const stock = findByName(state.materials, item.name)
      if (!stock || Number(stock.stock || 0) < Number(item.amount || 0)) {
        partialMissing.push(`${item.name}不足`)
      }
    }
    for (const item of (recipe && recipe.seasonings) || []) {
      const stock = findByName(state.seasonings, item.name)
      if (!stock || Number(stock.stock || 0) < Number(item.amount || 0)) {
        partialMissing.push(`${item.name}不足`)
      }
    }
    for (const item of (recipe && recipe.tools) || []) {
      const tool = findByName(state.tools, item.name)
      if (!tool || tool.status !== 'available' || Number(tool.count || 0) <= 0) {
        hardMissing.push(`${item.name}不可用`)
      }
    }

    return {
      ok: hardMissing.length === 0,
      partial: hardMissing.length === 0 && partialMissing.length > 0,
      missing: hardMissing.length ? hardMissing : partialMissing,
      hardMissing,
      partialMissing
    }
  }

  function getAvailableDishes() {
    return state.dishes
      .map((dish) => ({ ...dish, availability: canMakeDish(dish) }))
      .filter((dish) => dish.availability.ok)
      .filter(customerDishMatched)
  }

  function dishSearchText(dish) {
    return [dish.name, dish.category, dish.description].concat(displayTags(dish.tags || []), dish.requiredMaterials || []).join(' ').toLowerCase()
  }

  function customerDishMatched(dish) {
    const keyword = ui.keyword.trim().toLowerCase()
    const keywordMatched = !keyword || dishSearchText(dish).includes(keyword)
    const categoryMatched = ui.customerCategory === '全部' || dish.category === ui.customerCategory || dishHasTag(dish, ui.customerCategory)
    return keywordMatched && categoryMatched
  }

  function renderCustomerDishResults() {
    const dishes = getAvailableDishes()
    return `
      <div class="dish-grid" style="margin-top: 18px">
        ${dishes.map(renderDishCard).join('') || '<div class="panel empty">今天没有可点菜，去厨师端补库存吧。</div>'}
      </div>
      ${!dishes.length && (ui.keyword || ui.customerCategory !== '全部') ? '<div class="panel empty">没有找到匹配的菜。</div>' : ''}
    `
  }

  function refreshCustomerDishResults() {
    const container = app.querySelector('[data-customer-dish-results]')
    if (!container) {
      render()
      return
    }
    container.innerHTML = renderCustomerDishResults()
    app.querySelectorAll('[data-action="category"]').forEach((button) => {
      button.classList.toggle('active', button.dataset.category === ui.customerCategory)
    })
  }

  function logSearchText(log) {
    return [log.action, log.detail, JSON.stringify(log.meta || {}), formatDate(log.createdAt)].join(' ').toLowerCase()
  }

  function applyLogFilter() {
    const keyword = ui.logKeyword.trim().toLowerCase()
    const rows = Array.from(app.querySelectorAll('[data-log-line]'))
    let visible = 0
    rows.forEach((row) => {
      const keywordMatched = !keyword || (row.dataset.search || '').includes(keyword)
      const dateMatched = !ui.logDate || row.dataset.date === ui.logDate
      const matched = keywordMatched && dateMatched
      row.hidden = !matched
      if (matched) visible += 1
    })
    const empty = app.querySelector('[data-log-empty]')
    if (empty) empty.hidden = visible > 0
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

  function validateOrderAvailability(items, orderRemark, options = {}) {
    const errors = []
    const warnings = []
    const requirements = aggregateRequirements(items, orderRemark)
    requirements.materials.forEach((entry) => {
      const stock = findByName(state.materials, entry.name)
      if (!stock || Number(stock.stock || 0) < Number(entry.amount || 0)) {
        warnings.push(`${entry.name}不足，需要${entry.amount}${entry.unit}`)
      }
    })
    requirements.seasonings.forEach((entry) => {
      const stock = findByName(state.seasonings, entry.name)
      if (!stock || Number(stock.stock || 0) < Number(entry.amount || 0)) {
        warnings.push(`${entry.name}不足，需要${entry.amount}${entry.unit}`)
      }
    })
    requirements.tools.forEach((entry) => {
      const tool = findByName(state.tools, entry.name)
      if (!tool || tool.status !== 'available' || Number(tool.count || 0) <= 0) {
        errors.push(`${entry.name}不可用`)
      }
    })
    return options.allowIngredientShortage ? errors : warnings.concat(errors)
  }

  function orderShortageMessages(order) {
    return validateOrderAvailability(order.items || [], order.remark || '')
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
    const availability = canMakeDish(dish)
    if (!availability.ok) {
      showToast(availability.missing[0] || '这道菜暂时做不了')
      return
    }
    if (availability.partial) {
      window.alert('缺少原材料哦，不过还是能做！请联系Marshall大厨~')
    }
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

  function emailErrorMessage(error) {
    const text = error && (error.text || error.message || error.statusText)
    const status = error && error.status ? ` ${error.status}` : ''
    return text ? `邮件发送失败${status}：${text}` : '邮件发送失败：请检查 EmailJS 配置'
  }

  function aiErrorMessage(error) {
    const message = String(error && (error.message || error) || '')
    if (/Failed to fetch|NetworkError|CORS/i.test(message)) return 'AI 请求被浏览器或网络拦截，建议刷新后重试；若仍失败，可能需要后端代理。'
    if (/empty|空内容/i.test(message)) return 'DeepSeek JSON 模式返回了空内容，我已自动重试但仍为空；请再点一次生成，或把模型换成 deepseek-v4-pro。'
    if (/Insufficient|balance|quota|余额|429/i.test(message)) return 'DeepSeek 额度或频率受限，请检查平台余额/限流。'
    if (/model|404|not found/i.test(message)) return 'DeepSeek 模型名可能不可用，请改成 deepseek-v4-flash 或 deepseek-v4-pro。'
    if (/401|403|Unauthorized|Forbidden|invalid api key/i.test(message)) return 'DeepSeek API Key 没通过验证，请检查是否复制了完整 Key。'
    return `AI 生成失败：${message || '请稍后重试'}`
  }

  async function submitOrder() {
    if (!requireDatabase('提交订单')) return
    if (!state.cart.items.length) {
      showToast('点菜单还是空的')
      return
    }
    const errors = validateOrderAvailability(state.cart.items, state.cart.remark, { allowIngredientShortage: true })
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
      showToast(emailErrorMessage(error))
    }
  }

  function updateOrderStatus(orderId, status) {
    if (!requireDatabase('更新订单状态')) return
    const order = state.orders.find((item) => item.id === orderId)
    if (!order) return
    if (status === 'COOKING') {
      const errors = validateOrderAvailability(order.items, order.remark, { allowIngredientShortage: true })
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
    if (ui.view === 'customer') {
      if (customerUnlocked) renderCustomer()
      else renderCustomerLock()
    }
    if (ui.view === 'chef') {
      if (chefUnlocked) renderChef()
      else renderChefLock()
    }
    if (ui.view === 'settings') {
      if (settingsUnlocked) renderSettings()
      else renderSettingsLock()
    }
  }

  function switchView(view) {
    if (!view) return
    if (view === 'settings') {
      showToast('设置页已屏蔽，AI API 请在 AI 新增菜品里配置')
      view = 'customer'
    }
    if (ui.view === view) {
      return
    }
    ui.view = view
    ui.modal = ''
    ui.inventoryDraft = null
    render()
  }

  function renderCustomerLock() {
    app.innerHTML = `
      <section class="customer-lock">
        <div class="panel lock-panel cute-lock">
          <h1 class="section-title">Lucy的小饭碗</h1>
          <p class="subtle">先对暗号，Marshall 才能看到今天的小馋猫菜单。</p>
          <div class="form-grid lock-form">
            <label class="full">账号<input id="customerName" class="input" autocomplete="username" value="Lucy" placeholder="Lucy"></label>
            <label class="full">密码<input id="customerPassword" class="input" type="password" autocomplete="current-password" placeholder="输入小厨房暗号"></label>
          </div>
          <div class="toolbar">
            <button class="btn" data-action="unlockCustomer">打开今日菜单</button>
          </div>
        </div>
      </section>
    `
    const input = document.getElementById('customerPassword')
    if (input) input.focus()
  }

  function renderCustomer() {
    const unavailable = state.dishes
      .map((dish) => ({ ...dish, availability: canMakeDish(dish) }))
      .filter((dish) => dish.isListed && !dish.availability.ok)

    app.innerHTML = `
      <section class="grid two">
        <div>
          <div class="panel">
            <h1 class="section-title">今天想吃什么？</h1>
            <p class="subtle">只要主材料还有一点库存，就会展示出来；缺少部分材料的菜会标黄提醒，Marshall 大厨可以补料或替代。</p>
            <div class="toolbar">
              <input class="input" style="max-width: 320px" data-action="search" value="${escapeHtml(ui.keyword)}" placeholder="搜索菜名、分类或标签">
              ${CATEGORY_OPTIONS.map((item) => `<button class="mini-tab category-tab ${item === '全部' ? 'all-category' : 'small-category'} ${ui.customerCategory === item ? 'active' : ''}" data-action="category" data-category="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join('')}
            </div>
          </div>
          <div data-customer-dish-results>${renderCustomerDishResults()}</div>
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
            ${renderDishTags(dish, { maxMaterials: 2, maxDishTags: 2 })}
          </div>
          <div class="toolbar dish-actions">
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
    const availability = canMakeDish(dish)
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
            ${availability.partial ? '<div class="db-banner warn-banner">缺少原材料哦，不过还是能做！请联系Marshall大厨~</div>' : ''}
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
                  ${renderDishTags(dish, { maxMaterials: 4, maxDishTags: 99 })}
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
          <div class="form-grid lock-form">
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

  function renderSettingsLock() {
    app.innerHTML = `
      <section class="settings-lock">
        <div class="panel lock-panel">
          <h1 class="section-title">设置中心</h1>
          <p class="subtle">这里能修改 AI、邮件和数据维护配置，需要单独输入设置密码。当前暂设为 <strong>zazll1</strong>。</p>
          <form class="form-grid lock-form" onsubmit="window.unlockSettingsPanel && window.unlockSettingsPanel(); return false;">
            <label class="full">设置密码<input id="settingsPassword" class="input" type="password" autocomplete="current-password" placeholder="输入设置密码 zazll1"></label>
          </form>
          <div class="toolbar">
            <button class="btn" type="button" onclick="window.unlockSettingsPanel && window.unlockSettingsPanel(); return false;">进入设置</button>
            <button class="btn ghost" type="button" onclick="sessionStorage.removeItem('privateKitchenSettingsUnlocked'); location.reload()">重置设置登录</button>
          </div>
        </div>
      </section>
    `
    const input = document.getElementById('settingsPassword')
    if (input) input.focus()
  }

  function unlockSettingsPanel() {
    const input = document.getElementById('settingsPassword')
    const password = (input?.value || '').trim()
    if (password !== SETTINGS_PASSWORD) {
      showToast('设置密码不对，请输入 zazll1')
      if (input) input.focus()
      return false
    }
    settingsUnlocked = true
    sessionStorage.setItem('privateKitchenSettingsUnlocked', 'true')
    ui.view = 'settings'
    showToast('设置中心已解锁')
    render()
    return true
  }

  window.unlockSettingsPanel = unlockSettingsPanel

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
      ${renderChefModal()}
    `
    if (ui.chefTab === 'logs') applyLogFilter()
  }

  function renderChefModal() {
    if (ui.modal === 'newDishChoice') {
      return `
        <div class="modal-backdrop" data-action="closeModal">
          <div class="modal compact-modal" role="dialog" aria-modal="true">
            <div class="modal-head">
              <div>
                <strong>新增菜品</strong>
                <div class="subtle">选择 Marshall 今天要怎么录入新菜。</div>
              </div>
              <button class="btn small ghost" data-action="closeModal">关闭</button>
            </div>
            <div class="modal-body">
              <div class="grid two">
                <button class="choice-card" data-action="startAiDish">
                  <strong>AI 只填菜名</strong>
                  <span>输入菜名，DeepSeek 自动补全主材料、分类、价格、标签、简介和配方。</span>
                </button>
                <button class="choice-card" data-action="manualNewDish">
                  <strong>手动填写</strong>
                  <span>像现在一样创建空菜品，自己慢慢填全部信息。</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      `
    }
    if (ui.modal === 'aiDish') return renderAiDishModal()
    if (ui.modal === 'inventoryItem') return renderInventoryModal()
    return ''
  }

  function renderInventoryModal() {
    const draft = ui.inventoryDraft || { type: ui.inventoryTab }
    const isTool = draft.type === 'tools'
    return `
      <div class="modal-backdrop" data-action="closeModal">
        <div class="modal compact-modal" role="dialog" aria-modal="true">
          <div class="modal-head">
            <div>
              <strong>新增${draft.type === 'materials' ? '原材料' : draft.type === 'seasonings' ? '调配料' : '工具'}</strong>
              <div class="subtle">在这里填好信息，确认后会保存到 Supabase 状态。</div>
            </div>
            <button class="btn small ghost" data-action="closeModal">关闭</button>
          </div>
          <div class="modal-body">
            <div class="form-grid">
              <label class="full">名称<input class="input" data-form="inventoryDraft" data-field="name" value="${escapeHtml(draft.name || '')}" placeholder="${isTool ? '例如：炒锅' : '例如：茄子'}"></label>
              <label>分类<input class="input" data-form="inventoryDraft" data-field="category" value="${escapeHtml(draft.category || '')}" placeholder="${draft.type === 'materials' ? '素菜/荤菜/主食' : isTool ? '工具' : '调配料'}" required></label>
              ${isTool
                ? `<label>数量<input class="input" type="number" min="1" data-form="inventoryDraft" data-field="count" value="${Number(draft.count || 1)}"></label>`
                : `<label>当前库存<input class="input" type="number" min="0" data-form="inventoryDraft" data-field="stock" value="${Number(draft.stock || 0)}"></label>
                   <label>单位<input class="input" data-form="inventoryDraft" data-field="unit" value="${escapeHtml(draft.unit || '')}" placeholder="个/g/ml"></label>
                   <label>安全线<input class="input" type="number" min="0" data-form="inventoryDraft" data-field="safeStock" value="${Number(draft.safeStock || 0)}"></label>`
              }
            </div>
            <div class="toolbar">
              <button class="btn" data-action="confirmInventoryItem">确认新增</button>
              <button class="btn ghost" data-action="closeModal">取消</button>
            </div>
          </div>
        </div>
      </div>
    `
  }

  function renderAiDishModal() {
    const draft = ui.aiDishDraft
    return `
      <div class="modal-backdrop" data-action="closeModal">
        <div class="modal ai-modal" role="dialog" aria-modal="true">
          <div class="modal-head">
            <div>
              <strong>AI 新增菜品</strong>
              <div class="subtle">DeepSeek 只做草稿，确认后才会保存。</div>
            </div>
            <div class="toolbar compact-toolbar">
              <button class="btn small ghost" data-action="toggleAiConfig">${aiConfig.apiKey ? '修改 AI API' : '配置 AI API'}</button>
              <button class="btn small ghost" data-action="closeModal">关闭</button>
            </div>
          </div>
          <div class="modal-body">
            ${renderAiConfigPanel()}
            <div class="ai-generate-row">
              <input class="input" data-action="aiDishName" value="${escapeHtml(ui.aiDishName)}" placeholder="例如：乾隆白菜">
              <button class="btn" data-action="generateAiDish" ${ui.aiLoading ? 'disabled' : ''}>${ui.aiLoading ? '生成中...' : '生成草稿'}</button>
            </div>
            ${!aiConfig.apiKey ? '<div class="db-banner warn-banner">还没有 DeepSeek API Key。点击上方“配置 AI API”填写；它只保存在当前浏览器。</div>' : ''}
            ${draft ? renderAiDishDraft(draft) : '<div class="empty">输入菜名后生成草稿。</div>'}
          </div>
        </div>
      </div>
    `
  }

  function renderAiConfigPanel() {
    if (!ui.aiConfigOpen) return ''
    return `
      <div class="ai-config-panel">
        <div class="settings-card-head">
          <div>
            <h3>DeepSeek AI 配置</h3>
            <p class="subtle">只保存在当前浏览器 localStorage，不会写入数据库或 GitHub。</p>
          </div>
          <span class="tag ${aiConfig.apiKey ? 'material-tag' : 'warn'}">${aiConfig.apiKey ? '已填写' : '未填写'}</span>
        </div>
        <div class="form-grid">
          <label class="full">DeepSeek API Key<input class="input" type="password" data-form="aiConfig" data-field="apiKey" value="${escapeHtml(aiConfig.apiKey)}" placeholder="sk-..."></label>
          <label>Base URL<input class="input" data-form="aiConfig" data-field="baseUrl" value="${escapeHtml(aiConfig.baseUrl)}"></label>
          <label>模型<input class="input" data-form="aiConfig" data-field="model" value="${escapeHtml(aiConfig.model)}"></label>
        </div>
        <div class="toolbar">
          <button class="btn small ghost" data-action="toggleAiConfig">收起配置</button>
          <button class="btn small secondary" data-action="clearAiConfig">清空 API Key</button>
        </div>
      </div>
    `
  }

  function renderAiDishDraft(draft) {
    const dish = draft.dish
    const recipe = draft.recipe
    return `
      <div class="ai-draft-grid">
        <label>菜名<input id="aiDraftName" class="input" value="${escapeHtml(dish.name)}"></label>
        <label>分类<input id="aiDraftCategory" class="input" value="${escapeHtml(dish.category)}"></label>
        <label>价格<input id="aiDraftPrice" class="input" type="number" value="${Number(dish.price || 18)}"></label>
        <label>制作时间<input id="aiDraftCookTime" class="input" type="number" value="${Number(dish.cookTime || 15)}"></label>
        <label class="full">必须材料<input id="aiDraftRequired" class="input" value="${escapeHtml((dish.requiredMaterials || []).join('，'))}"></label>
        <label class="full">标签<input id="aiDraftTags" class="input" value="${escapeHtml((dish.tags || []).join('，'))}"></label>
        <label class="full">简介<textarea id="aiDraftDescription" class="textarea">${escapeHtml(dish.description || '')}</textarea></label>
        <label>原材料<textarea id="aiDraftMaterials" class="textarea ai-draft-textarea">${escapeHtml(listToRaw(recipe.materials, 'amount'))}</textarea></label>
        <label>调配料<textarea id="aiDraftSeasonings" class="textarea ai-draft-textarea">${escapeHtml(listToRaw(recipe.seasonings, 'amount'))}</textarea></label>
        <label>工具<textarea id="aiDraftTools" class="textarea ai-draft-textarea">${escapeHtml(listToRaw(recipe.tools, 'name'))}</textarea></label>
        <label>步骤<textarea id="aiDraftSteps" class="textarea ai-draft-textarea">${escapeHtml((recipe.steps || []).join('\n'))}</textarea></label>
      </div>
      <div class="toolbar">
        <button class="btn" data-action="confirmAiDish">确认创建菜品</button>
        <button class="btn ghost" data-action="generateAiDish">重新生成</button>
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
    const active = ui.selectedOrderId === order.id
    const statusClass = order.status === 'CANCELLED' ? 'bad' : ['READY', 'FINISHED'].includes(order.status) ? 'done' : ''
    return `
      <div class="order-line clickable ${active ? 'active' : ''}" data-action="selectOrder" data-id="${order.id}" role="button" tabindex="0" aria-label="查看订单 #${escapeHtml(order.orderNo)}">
        <div>
          <strong>#${escapeHtml(order.orderNo)}</strong>
          <div class="subtle">${formatDate(order.createdAt)} · ${order.items.map((item) => `${item.name}×${item.quantity}`).join('，')}</div>
        </div>
        <span class="order-status-pill ${statusClass}">${STATUS_TEXT[order.status] || order.status}</span>
      </div>
    `
  }

  function renderOrderDetail(order) {
    const canProgress = !['READY', 'FINISHED', 'CANCELLED'].includes(order.status)
    const shortages = orderShortageMessages(order)
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
        ${shortages.length ? `<div class="db-banner warn-banner"><strong>缺少项提醒</strong><div class="subtle">${shortages.map(escapeHtml).join('、')}</div></div>` : ''}
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
    const isTool = active === 'tools'
    return `
      <div class="inventory-row ${isTool ? 'tool-row' : ''}">
        <strong>${escapeHtml(item.name)}</strong>
        <input class="input mini-input" data-action="inventoryCategory" data-type="${active}" data-id="${item.id}" value="${escapeHtml(item.category || (isTool ? '工具' : ''))}" placeholder="${active === 'materials' ? '素菜/荤菜/主食' : isTool ? '工具' : '调配料'}">
        ${isTool
          ? `<span class="stock-pill">${item.count || 0} 个</span><span class="stock-pill ${item.status === 'available' ? '' : 'bad'}">${item.status === 'available' ? '可用' : '不可用'}</span>`
          : `<span class="stock-pill">${item.stock}${item.unit}</span><span>${escapeHtml(item.unit || '-')}</span><span class="subtle">安全线 ${item.safeStock ?? 0}${item.unit || ''}</span>`
        }
        <div class="qty">
          ${isTool
            ? `<span>${item.count} · ${item.status === 'available' ? '可用' : '不可用'}</span><button class="btn small ghost" data-action="toggleTool" data-id="${item.id}">${item.status === 'available' ? '停用' : '启用'}</button>`
            : `<button class="btn small ghost" data-action="stockDelta" data-type="${active}" data-id="${item.id}" data-delta="-1">-</button><strong>${item.stock}${item.unit}</strong><button class="btn small" data-action="stockDelta" data-type="${active}" data-id="${item.id}" data-delta="1">+</button>`
          }
        </div>
      </div>
    `
  }

  function renderInventoryList(list, active) {
    const isTool = active === 'tools'
    return `
      <div class="inventory-table ${isTool ? 'tools-table' : ''}">
        <div class="inventory-row inventory-head">
          <span>名称</span>
          <span>分类</span>
          <span>${isTool ? '数量' : '库存'}</span>
          <span>${isTool ? '状态' : '单位'}</span>
          ${isTool ? '' : '<span>安全线</span>'}
          <span>操作</span>
        </div>
        ${list.map((item) => renderStockLine(item, active)).join('') || '<div class="empty slim">暂无库存项。</div>'}
      </div>
    `
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
    const tags = displayTags(dish.tags || [])
    const customTags = tags.filter((tag) => !DISH_TAG_OPTIONS.includes(tag))
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
          <label class="full">必须材料<input class="input" data-form="dishRequiredMaterials" value="${escapeHtml((dish.requiredMaterials || []).join('，'))}" placeholder="例如：土豆，猪肉"></label>
          <div class="full field-block">
            <span class="field-label">菜品标签</span>
            <div class="selectable-tags">
              ${DISH_TAG_OPTIONS.map((tag) => `<button type="button" class="tag-option ${dishHasTag(dish, tag) ? 'active' : ''}" data-action="toggleDishTag" data-id="${dish.id}" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`).join('')}
            </div>
          </div>
          <label class="full">自定义标签<input class="input" data-form="dishCustomTags" value="${escapeHtml(customTags.join('，'))}" placeholder="例如：下饭，少油，快手"></label>
          <label class="full">简介<textarea class="textarea" data-form="dish" data-field="description">${escapeHtml(dish.description)}</textarea></label>
        </div>
        <div class="toolbar">
          <label class="tag"><input type="checkbox" data-action="toggleDishBool" data-id="${dish.id}" data-field="isListed" ${flagDraft.isListed ? 'checked' : ''}> 上架</label>
          <label class="tag"><input type="checkbox" data-action="toggleDishBool" data-id="${dish.id}" data-field="isFavorite" ${flagDraft.isFavorite ? 'checked' : ''}> Lucy最爱</label>
          <button class="btn small" data-action="confirmDishFlags" data-id="${dish.id}">确定状态</button>
          <button class="btn small danger" data-action="deleteDish" data-id="${dish.id}">删除菜品</button>
        </div>
        <p class="subtle">永久图片可以放到 <code>assets/dishes/</code> 或 <code>assets/uploads/</code>，再把相对路径填到图片地址。网页内上传会写入当前数据库状态。</p>
      </div>
    `
  }

  function ensureRecipe(dishId) {
    let recipe = recipeFor(dishId)
    if (!recipe) {
      recipe = { id: uid('recipe'), dishId, materials: [], seasonings: [], tools: [], steps: [] }
      state.recipes.push(recipe)
    }
    return recipe
  }

  function recipeItemDefault(field) {
    if (field === 'materials') return { name: '', amount: 1, unit: '个' }
    if (field === 'seasonings') return { name: '', amount: 5, unit: 'ml' }
    if (field === 'tools') return { name: '' }
    return ''
  }

  function renderRecipeTable(recipe, field, title) {
    const list = recipe[field] || []
    return `
      <section class="recipe-box">
        <div class="recipe-box-head">
          <div>
            <h3>${title}</h3>
            <p class="subtle">逐行维护，保存后订单详情会同步使用。</p>
          </div>
          <button class="btn small ghost" data-action="addRecipeItem" data-field="${field}">新增</button>
        </div>
        <div class="recipe-table">
          <div class="recipe-table-row recipe-table-head">
            <span>名称</span><span>数量</span><span>单位</span><span>操作</span>
          </div>
          ${list.map((item, index) => `
            <div class="recipe-table-row">
              <input class="input mini-input" data-action="recipeItem" data-field="${field}" data-index="${index}" data-key="name" value="${escapeHtml(item.name || '')}" placeholder="名称">
              <input class="input mini-input" type="number" data-action="recipeItem" data-field="${field}" data-index="${index}" data-key="amount" value="${Number(item.amount || 0)}" placeholder="数量">
              <input class="input mini-input" data-action="recipeItem" data-field="${field}" data-index="${index}" data-key="unit" value="${escapeHtml(item.unit || '')}" placeholder="单位">
              <button class="btn small ghost" data-action="deleteRecipeItem" data-field="${field}" data-index="${index}">删除</button>
            </div>
          `).join('') || '<div class="empty slim">还没有配置。</div>'}
        </div>
      </section>
    `
  }

  function renderRecipeTools(recipe) {
    const list = recipe.tools || []
    return `
      <section class="recipe-box">
        <div class="recipe-box-head">
          <div>
            <h3>工具</h3>
            <p class="subtle">写需要用到的厨具或设备。</p>
          </div>
          <button class="btn small ghost" data-action="addRecipeItem" data-field="tools">新增</button>
        </div>
        <div class="recipe-chip-list">
          ${list.map((item, index) => `
            <div class="recipe-chip-edit">
              <input class="input mini-input" data-action="recipeItem" data-field="tools" data-index="${index}" data-key="name" value="${escapeHtml(item.name || '')}" placeholder="工具名称">
              <button class="btn small ghost" data-action="deleteRecipeItem" data-field="tools" data-index="${index}">删除</button>
            </div>
          `).join('') || '<div class="empty slim">还没有配置工具。</div>'}
        </div>
      </section>
    `
  }

  function renderRecipeSteps(recipe) {
    const list = recipe.steps || []
    return `
      <section class="recipe-box">
        <div class="recipe-box-head">
          <div>
            <h3>步骤</h3>
            <p class="subtle">按实际制作顺序排列。</p>
          </div>
          <button class="btn small ghost" data-action="addRecipeItem" data-field="steps">新增</button>
        </div>
        <div class="recipe-step-list">
          ${list.map((step, index) => `
            <div class="recipe-step-card">
              <span class="step-index">${index + 1}</span>
              <textarea class="textarea step-input" data-action="recipeStep" data-index="${index}" placeholder="写一步做法">${escapeHtml(step)}</textarea>
              <div class="step-actions">
                <button class="btn small ghost" data-action="moveRecipeStep" data-index="${index}" data-direction="-1" ${index === 0 ? 'disabled' : ''}>上移</button>
                <button class="btn small ghost" data-action="moveRecipeStep" data-index="${index}" data-direction="1" ${index === list.length - 1 ? 'disabled' : ''}>下移</button>
                <button class="btn small ghost" data-action="deleteRecipeItem" data-field="steps" data-index="${index}">删除</button>
              </div>
            </div>
          `).join('') || '<div class="empty slim">还没有步骤。</div>'}
        </div>
      </section>
    `
  }

  function renderRecipeAdmin() {
    const dish = state.dishes.find((item) => item.id === ui.editingDishId) || state.dishes[0]
    if (!dish) return '<div class="panel empty">还没有菜品。</div>'
    const recipe = recipeFor(dish.id) || { materials: [], seasonings: [], tools: [], steps: [] }
    return `
      <div class="recipe-admin">
        <div class="panel recipe-list-panel">
          ${state.dishes.map((item) => `
            <div class="recipe-list-line ${dish.id === item.id ? 'active' : ''}">
              <span>${escapeHtml(item.name)}</span>
              <button class="btn small ${dish.id === item.id ? '' : 'ghost'}" data-action="editDish" data-id="${item.id}">编辑</button>
            </div>
          `).join('')}
        </div>
        <aside class="panel recipe-editor-panel">
          <div class="recipe-editor-title">
            <div>
              <h2 class="section-title">${escapeHtml(dish.name)} 配方</h2>
              <p class="subtle">结构化维护配方，顾客下单后的厨师详情会读取这里。</p>
            </div>
            <span class="tag material-tag">${(recipe.materials || []).length} 种原材料</span>
          </div>
          <div class="recipe-editor-grid">
            ${renderRecipeTable(recipe, 'materials', '原材料')}
            ${renderRecipeTable(recipe, 'seasonings', '调配料')}
            ${renderRecipeTools(recipe)}
            ${renderRecipeSteps(recipe)}
          </div>
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
        <div class="log-search">
          <input class="input" data-action="logSearch" value="${escapeHtml(ui.logKeyword)}" placeholder="搜索时间、菜品、操作或备注">
          <input class="input" type="date" data-action="logDate" value="${escapeHtml(ui.logDate)}">
          <button class="btn ghost" data-action="clearLogFilters">清空</button>
        </div>
        ${logs.map((log) => `
          <div class="log-line" data-log-line data-search="${escapeHtml(logSearchText(log))}" data-date="${escapeHtml(dateKey(log.createdAt))}">
            <div class="subtle">${formatDate(log.createdAt)}</div>
            <div>
              <strong>${escapeHtml(log.action)}</strong>
              <div class="subtle">${escapeHtml(log.detail || '')}</div>
            </div>
          </div>
        `).join('') || '<div class="empty">还没有记录。</div>'}
        <div class="empty" data-log-empty hidden>没有匹配的记录。</div>
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
      <section class="settings-page">
        <div class="panel settings-hero">
          <h1 class="section-title">设置</h1>
          <p class="subtle">这里集中管理 AI 生成菜谱、点单邮件、Supabase 数据同步和数据维护。输入框修改后会自动保存到对应位置。</p>
        </div>
        <div class="settings-grid">
          <div class="panel settings-card">
            <div class="settings-card-head">
              <h2 class="section-title">DeepSeek AI</h2>
              <span class="tag warn">本机保存</span>
            </div>
            <p class="subtle">用于“AI 只填菜名”新增菜品。API Key 只保存在当前浏览器 localStorage，不会写入 Supabase，也不会提交到 GitHub。</p>
            <div class="form-grid">
              <label class="full">DeepSeek API Key<input class="input" type="password" data-form="aiConfig" data-field="apiKey" value="${escapeHtml(aiConfig.apiKey)}" placeholder="sk-..."></label>
              <label>Base URL<input class="input" data-form="aiConfig" data-field="baseUrl" value="${escapeHtml(aiConfig.baseUrl)}"></label>
              <label>模型<input class="input" data-form="aiConfig" data-field="model" value="${escapeHtml(aiConfig.model)}"></label>
            </div>
            <p class="subtle">当前状态：${aiConfig.apiKey ? '已配置，可以在厨师工作台新增菜品时使用 AI 草稿。' : '未填写 Key，AI 新增菜品会提示先配置。'}</p>
          </div>

          <div class="panel settings-card">
            <div class="settings-card-head">
              <h2 class="section-title">EmailJS 点单邮件</h2>
              <span class="tag ${config.enabled ? '' : 'bad'}">${config.enabled ? '已启用' : '未启用'}</span>
            </div>
            <p class="subtle">顾客提交点单后，通过 EmailJS 发送邮件到你的邮箱；未配置成功时仍会打开邮件客户端兜底。</p>
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
          <p class="subtle">Service ${escapeHtml(config.serviceId || '未填')} · Template ${escapeHtml(config.templateId || '未填')} · Public Key ${config.publicKey ? '已填写' : '未填'}</p>
          </div>

          <div class="panel settings-card">
            <h2 class="section-title">Supabase 数据库</h2>
            ${renderDatabaseStatus()}
            <p class="subtle">订单、点菜单、菜品、配方、库存、分类、操作记录都会通过 Supabase 同步。localStorage 只作为本机预览缓存。</p>
          </div>

          <div class="panel settings-card settings-card-wide">
            <div class="settings-card-head">
              <h2 class="section-title">数据维护</h2>
              <span class="tag material-tag">当前状态快照</span>
            </div>
            <div class="toolbar">
              <button class="btn ghost" data-action="exportData">导出数据</button>
              <button class="btn ghost" data-action="toggleStateSnapshot">${ui.showStateSnapshot ? '隐藏状态快照' : '显示状态快照'}</button>
              <button class="btn secondary" data-action="resetData">恢复初始数据</button>
            </div>
            ${ui.showStateSnapshot
              ? `<textarea class="textarea settings-state" readonly>${escapeHtml(JSON.stringify(state, null, 2))}</textarea>`
              : '<div class="empty slim">状态快照可能包含较大的图片数据。需要查看时再点击“显示状态快照”。</div>'
            }
          </div>
        </div>
      </section>
    `
  }

  function addInventoryItem() {
    if (!requireDatabase('新增库存项')) return
    ui.inventoryDraft = {
      type: ui.inventoryTab,
      name: '',
      category: ui.inventoryTab === 'materials' ? '素菜' : ui.inventoryTab === 'seasonings' ? '调配料' : '工具',
      stock: ui.inventoryTab === 'materials' ? 1 : 100,
      unit: ui.inventoryTab === 'materials' ? '个' : 'g',
      safeStock: 0,
      count: 1
    }
    ui.modal = 'inventoryItem'
    render()
  }

  function confirmInventoryItem() {
    if (!requireDatabase('新增库存项')) return
    const draft = ui.inventoryDraft
    if (!draft) return
    const name = String(draft.name || '').trim()
    const category = String(draft.category || '').trim()
    if (!name) {
      showToast('先给新库存起个名字吧')
      return
    }
    if (!category) {
      showToast('分类也要填上，后面找东西更快')
      return
    }
    if (draft.type === 'tools') {
      state.tools.push({ id: uid('tool'), name, category, count: Math.max(1, Number(draft.count || 1)), status: 'available' })
    } else {
      const item = {
        id: uid(draft.type === 'materials' ? 'mat' : 'sea'),
        name,
        category,
        stock: Math.max(0, Number(draft.stock || 0)),
        unit: String(draft.unit || '').trim(),
        safeStock: Math.max(0, Number(draft.safeStock || 0)),
        isAvailable: true
      }
      if (draft.type === 'materials') state.materials.push(item)
      if (draft.type === 'seasonings') state.seasonings.push(item)
    }
    saveState()
    recordLog('厨师新增库存项', name, { inventoryTab: draft.type, category })
    ui.inventoryDraft = null
    ui.modal = ''
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
      requiredMaterials: [],
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

  function normalizeAiDishDraft(raw, fallbackName) {
    const dish = raw && raw.dish ? raw.dish : {}
    const recipe = raw && raw.recipe ? raw.recipe : {}
    return {
      dish: {
        name: String(dish.name || fallbackName || '新菜品').trim(),
        category: String(dish.category || '家常菜').trim(),
        price: Number(dish.price || 18),
        cookTime: Number(dish.cookTime || 15),
        description: String(dish.description || `${fallbackName || '新菜品'}，AI 生成草稿。`).trim(),
        tags: displayTags(dish.tags || []),
        requiredMaterials: uniqueNames(dish.requiredMaterials || [])
      },
      recipe: {
        materials: Array.isArray(recipe.materials) ? recipe.materials.map((item) => ({ name: String(item.name || '').trim(), amount: Number(item.amount || 0), unit: String(item.unit || '').trim() })).filter((item) => item.name) : [],
        seasonings: Array.isArray(recipe.seasonings) ? recipe.seasonings.map((item) => ({ name: String(item.name || '').trim(), amount: Number(item.amount || 0), unit: String(item.unit || '').trim() })).filter((item) => item.name) : [],
        tools: Array.isArray(recipe.tools) ? recipe.tools.map((item) => ({ name: String(item.name || '').trim() })).filter((item) => item.name) : [],
        steps: Array.isArray(recipe.steps) ? recipe.steps.map((item) => String(item || '').trim()).filter(Boolean) : []
      }
    }
  }

  function extractDeepSeekContent(data) {
    const choice = data && data.choices && data.choices[0]
    const message = choice && choice.message
    return String((message && (message.content || message.reasoning_content)) || data.output_text || '').trim()
  }

  function parseJsonContent(content) {
    const raw = String(content || '').trim()
    if (!raw) throw new Error('DeepSeek 返回了空内容，请重试一次')
    try {
      return JSON.parse(raw)
    } catch (error) {
      const matched = raw.match(/\{[\s\S]*\}/)
      if (matched) return JSON.parse(matched[0])
      throw error
    }
  }

  async function requestAiDishJson(userPrompt, retryIndex = 0) {
    const response = await fetch(`${aiConfig.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aiConfig.apiKey.trim()}`
      },
      body: JSON.stringify({
        model: aiConfig.model.trim() || DEFAULT_AI_CONFIG.model,
        messages: [
          { role: 'system', content: AI_SYSTEM_PROMPT },
          { role: 'user', content: retryIndex ? `${userPrompt}\n上次返回为空。本次必须输出非空合法json对象，不要解释。` : userPrompt }
        ],
        temperature: retryIndex ? 0.1 : 0.2,
        max_tokens: 1600,
        stream: false,
        thinking: { type: 'disabled' },
        response_format: { type: 'json_object' }
      })
    })
    const text = await response.text()
    let data = {}
    try {
      data = text ? JSON.parse(text) : {}
    } catch (error) {
      throw new Error(`DeepSeek 返回不是 JSON：${text.slice(0, 120)}`)
    }
    if (!response.ok) throw new Error(data.error?.message || `DeepSeek 请求失败 ${response.status}`)
    const content = extractDeepSeekContent(data)
    if (!content && retryIndex < 2) return requestAiDishJson(userPrompt, retryIndex + 1)
    return parseJsonContent(content)
  }

  async function generateAiDishDraft() {
    if (!aiConfig.apiKey) {
      ui.aiConfigOpen = true
      render()
      showToast('先填写 DeepSeek API Key 哦')
      return
    }
    const dishName = ui.aiDishName.trim()
    if (!dishName) {
      showToast('先告诉 AI 菜名呀')
      return
    }
    ui.aiLoading = true
    render()
    try {
      const userPrompt = [
        `菜名: ${dishName}`,
        `库存材料: ${state.materials.map((item) => item.name).join('、')}`,
        `调料: ${state.seasonings.map((item) => item.name).join('、')}`,
        `工具: ${state.tools.map((item) => item.name).join('、')}`,
        '分类候选: 家常菜/主食/素菜/蒸菜/汤/凉菜',
        '生成1人份，json。'
      ].join('\n')
      const rawDraft = await requestAiDishJson(userPrompt)
      ui.aiDishDraft = normalizeAiDishDraft(rawDraft, dishName)
      showToast('AI 草稿生成好了')
    } catch (error) {
      console.error(error)
      showToast(aiErrorMessage(error))
    } finally {
      ui.aiLoading = false
      render()
    }
  }

  function readAiDishDraftFromForm() {
    return normalizeAiDishDraft({
      dish: {
        name: document.getElementById('aiDraftName')?.value,
        category: document.getElementById('aiDraftCategory')?.value,
        price: document.getElementById('aiDraftPrice')?.value,
        cookTime: document.getElementById('aiDraftCookTime')?.value,
        requiredMaterials: parseNameList(document.getElementById('aiDraftRequired')?.value),
        tags: parseNameList(document.getElementById('aiDraftTags')?.value),
        description: document.getElementById('aiDraftDescription')?.value
      },
      recipe: {
        materials: parseLines(document.getElementById('aiDraftMaterials')?.value, 'amount'),
        seasonings: parseLines(document.getElementById('aiDraftSeasonings')?.value, 'amount'),
        tools: parseLines(document.getElementById('aiDraftTools')?.value, 'name'),
        steps: String(document.getElementById('aiDraftSteps')?.value || '').split('\n').map((line) => line.trim()).filter(Boolean)
      }
    }, ui.aiDishName)
  }

  function confirmAiDish() {
    if (!requireDatabase('创建 AI 菜品')) return
    const draft = readAiDishDraftFromForm()
    const tags = displayTags(draft.dish.tags || [])
    const dish = {
      id: uid('dish'),
      name: draft.dish.name,
      category: draft.dish.category,
      price: draft.dish.price,
      costPrice: 0,
      cookTime: draft.dish.cookTime,
      emoji: '🍳',
      imageUrl: 'assets/dishes/egg-fried-rice.jpg',
      description: draft.dish.description,
      tags,
      requiredMaterials: draft.dish.requiredMaterials,
      isFavorite: tags.includes(FAVORITE_TAG),
      isListed: false
    }
    state.dishes.unshift(dish)
    state.recipes.push({
      id: uid('recipe'),
      dishId: dish.id,
      materials: draft.recipe.materials,
      seasonings: draft.recipe.seasonings,
      tools: draft.recipe.tools,
      steps: draft.recipe.steps
    })
    ui.editingDishId = dish.id
    ui.dishFlagDrafts[dish.id] = { isListed: dish.isListed, isFavorite: dish.isFavorite }
    ui.aiDishDraft = null
    ui.aiDishName = ''
    ui.modal = ''
    saveState()
    recordLog('AI 新增菜品', dish.name, { dishId: dish.id, requiredMaterials: dish.requiredMaterials })
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

  async function handleDishImageUpload(target) {
    if (!requireDatabase('上传菜品图片')) return
    const file = target.files && target.files[0]
    const dish = dishById(target.dataset.id)
    if (!file || !dish) return
    try {
      showToast('正在压缩并保存图片...')
      dish.imageUrl = await compressDishImage(file)
      const saved = await persistStateNow()
      await recordLog('厨师上传菜品图片', dish.name, { dishId: dish.id })
      showToast(saved ? '图片已永久保存到数据库' : '图片已更新，本次数据库保存未完成')
      render()
    } catch (error) {
      console.error(error)
      showToast(error.message || '图片上传失败，请换一张图片试试')
    } finally {
      target.value = ''
    }
  }

  function scheduleDishTagLog(dish) {
    window.clearTimeout(dishTagLogTimers.get(dish.id))
    dishTagLogTimers.set(dish.id, window.setTimeout(() => {
      dishTagLogTimers.delete(dish.id)
      recordLog('厨师编辑菜品标签', `${dish.name}：${displayTags(dish.tags || []).join('、') || '无标签'}`, { dishId: dish.id, tags: displayTags(dish.tags || []) })
    }, 450))
  }

  function handleInput(event) {
    const target = event.target
    if (target.dataset.action === 'search') {
      ui.keyword = target.value
      refreshCustomerDishResults()
      return
    }
    if (target.dataset.action === 'logSearch') {
      ui.logKeyword = target.value
      applyLogFilter()
      return
    }
    if (target.dataset.action === 'logDate') {
      ui.logDate = target.value
      applyLogFilter()
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
    if (target.dataset.form === 'inventoryDraft') {
      if (!ui.inventoryDraft) return
      const field = target.dataset.field
      ui.inventoryDraft[field] = ['stock', 'safeStock', 'count'].includes(field) ? Number(target.value || 0) : target.value
      return
    }
    if (target.dataset.action === 'inventoryCategory') {
      if (!requireDatabase('编辑库存分类')) return
      const list = target.dataset.type === 'materials' ? state.materials : target.dataset.type === 'seasonings' ? state.seasonings : state.tools
      const item = list.find((entry) => entry.id === target.dataset.id)
      if (!item) return
      item.category = target.value.trim()
      saveState()
      if (event.type === 'change') {
        recordLog('厨师编辑库存分类', `${item.name} -> ${item.category || '未分类'}`, { type: target.dataset.type, id: item.id, category: item.category })
        render()
      }
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
      dish.tags = displayTags(String(target.value || '').split(/[，,\s]+/).map((tag) => tag.trim()).filter(Boolean))
      saveState({ cacheDelay: event.type === 'input' ? 250 : 0, dbDelay: event.type === 'input' ? 450 : 80 })
      if (event.type === 'change') recordLog('厨师编辑菜品标签', `${dish.name}：${dish.tags.join('、') || '无标签'}`, { dishId: dish.id, tags: dish.tags })
      return
    }
    if (target.dataset.form === 'dishCustomTags') {
      if (!requireDatabase('编辑菜品标签')) return
      const dish = dishById(ui.editingDishId)
      if (!dish) return
      const fixedTags = displayTags(dish.tags || []).filter((tag) => DISH_TAG_OPTIONS.includes(tag))
      const customTags = displayTags(String(target.value || '').split(/[，,\s]+/).map((tag) => tag.trim()).filter(Boolean)).filter((tag) => !DISH_TAG_OPTIONS.includes(tag))
      dish.tags = uniqueNames([...fixedTags, ...customTags])
      saveState({ cacheDelay: event.type === 'input' ? 250 : 0, dbDelay: event.type === 'input' ? 450 : 80 })
      if (event.type === 'change') recordLog('厨师编辑菜品标签', `${dish.name}：${dish.tags.join('、') || '无标签'}`, { dishId: dish.id, tags: dish.tags })
      return
    }
    if (target.dataset.form === 'dishRequiredMaterials') {
      if (!requireDatabase('编辑必须材料')) return
      const dish = dishById(ui.editingDishId)
      if (!dish) return
      dish.requiredMaterials = uniqueNames(target.value)
      saveState({ cacheDelay: event.type === 'input' ? 250 : 0, dbDelay: event.type === 'input' ? 450 : 80 })
      if (event.type === 'change') recordLog('厨师编辑必须材料', `${dish.name}：${dish.requiredMaterials.join('、') || '无'}`, { dishId: dish.id, requiredMaterials: dish.requiredMaterials })
      return
    }
    if (target.dataset.form === 'email') {
      state.email[target.dataset.field] = target.value
      saveState()
      return
    }
    if (target.dataset.form === 'aiConfig') {
      aiConfig[target.dataset.field] = target.dataset.field === 'apiKey' ? target.value.trim() : target.value.trim()
      saveAiConfig()
      return
    }
    if (target.dataset.action === 'aiDishName') {
      ui.aiDishName = target.value
      return
    }
    if (target.dataset.action === 'recipeItem') {
      if (!requireDatabase('编辑配方')) return
      const dish = dishById(ui.editingDishId)
      if (!dish) return
      const recipe = ensureRecipe(dish.id)
      const field = target.dataset.field
      const index = Number(target.dataset.index)
      const key = target.dataset.key
      if (!recipe[field] || !recipe[field][index]) return
      recipe[field][index][key] = key === 'amount' ? Number(target.value || 0) : target.value
      saveState()
      if (event.type === 'change') recordLog('厨师编辑配方', `${dish.name} 更新 ${field}`, { dishId: dish.id, field })
      return
    }
    if (target.dataset.action === 'recipeStep') {
      if (!requireDatabase('编辑配方')) return
      const dish = dishById(ui.editingDishId)
      if (!dish) return
      const recipe = ensureRecipe(dish.id)
      const index = Number(target.dataset.index)
      recipe.steps[index] = target.value
      saveState()
      if (event.type === 'change') recordLog('厨师编辑配方', `${dish.name} 更新 steps`, { dishId: dish.id, field: 'steps' })
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
      void handleDishImageUpload(target)
    }
  }

  function handleClick(event) {
    const target = event.target.closest('[data-action]')
    if (!target) return
    const action = target.dataset.action

    if (action === 'category') {
      ui.customerCategory = target.dataset.category
      refreshCustomerDishResults()
      return
    }
    if (action === 'openDish' || action === 'showRecipe') {
      ui.selectedDishId = target.dataset.id
      ui.modal = action === 'showRecipe' ? 'dishIntro' : 'dishOrder'
      render()
      return
    }
    if (action === 'closeModal') {
      const clickedBackdrop = target.classList.contains('modal-backdrop') && event.target === target
      const clickedCloseButton = Boolean(event.target.closest('button[data-action="closeModal"]'))
      if (!clickedBackdrop && !clickedCloseButton) return
      ui.modal = ''
      ui.inventoryDraft = null
      render()
      return
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
    if (action === 'unlockCustomer') {
      const name = (document.getElementById('customerName')?.value || CUSTOMER_USERNAME).trim() || CUSTOMER_USERNAME
      const password = document.getElementById('customerPassword')?.value || ''
      if (name !== CUSTOMER_USERNAME) {
        showToast('咦，这不是Lucy的小饭碗账号～')
        return
      }
      if (password !== CUSTOMER_PASSWORD) {
        showToast('暗号不对，Marshall还不能开锅！')
        return
      }
      customerUnlocked = true
      sessionStorage.setItem('privateKitchenCustomerUnlocked', 'true')
      showToast('欢迎Lucy，今天想吃点什么呀？')
      render()
      return
    }
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
      return
    }
    if (action === 'unlockSettings') {
      unlockSettingsPanel()
      return
    }
    if (action === 'chefTab') {
      if (ui.chefTab === target.dataset.tab) return
      ui.chefTab = target.dataset.tab
      render()
      return
    }
    if (action === 'selectOrder') {
      if (ui.selectedOrderId === target.dataset.id) return
      ui.selectedOrderId = target.dataset.id
      render()
      return
    }
    if (action === 'orderStatus') return updateOrderStatus(target.dataset.id, target.dataset.status)
    if (action === 'inventoryTab') {
      if (ui.inventoryTab === target.dataset.tab) return
      ui.inventoryTab = target.dataset.tab
      render()
      return
    }
    if (action === 'stockDelta') {
      if (!requireDatabase('调整库存')) return
      const list = target.dataset.type === 'materials' ? state.materials : state.seasonings
      const item = list.find((entry) => entry.id === target.dataset.id)
      if (item) item.stock = Math.max(0, Number(item.stock || 0) + Number(target.dataset.delta))
      saveState()
      if (item) recordLog('厨师调整库存', `${item.name} ${target.dataset.delta > 0 ? '+' : ''}${target.dataset.delta}${item.unit || ''}`, { type: target.dataset.type, id: item.id, stock: item.stock })
      render()
      return
    }
    if (action === 'toggleTool') {
      if (!requireDatabase('调整工具状态')) return
      const tool = state.tools.find((entry) => entry.id === target.dataset.id)
      if (tool) tool.status = tool.status === 'available' ? 'unavailable' : 'available'
      saveState()
      if (tool) recordLog('厨师调整工具状态', `${tool.name} -> ${tool.status === 'available' ? '可用' : '不可用'}`, { toolId: tool.id, status: tool.status })
      render()
      return
    }
    if (action === 'addInventory') return addInventoryItem()
    if (action === 'confirmInventoryItem') return confirmInventoryItem()
    if (action === 'newDish') {
      ui.modal = 'newDishChoice'
      render()
    }
    if (action === 'manualNewDish') {
      ui.modal = ''
      createNewDish()
    }
    if (action === 'startAiDish') {
      ui.modal = 'aiDish'
      ui.aiDishDraft = null
      render()
    }
    if (action === 'generateAiDish') generateAiDishDraft()
    if (action === 'confirmAiDish') confirmAiDish()
    if (action === 'toggleAiConfig') {
      ui.aiConfigOpen = !ui.aiConfigOpen
      render()
      return
    }
    if (action === 'clearAiConfig') {
      aiConfig.apiKey = ''
      saveAiConfig()
      showToast('AI API Key 已清空')
      render()
      return
    }
    if (action === 'editDish') {
      ui.editingDishId = target.dataset.id
      render()
    }
    if (action === 'addRecipeItem') {
      if (!requireDatabase('编辑配方')) return
      const dish = dishById(ui.editingDishId)
      if (!dish) return
      const recipe = ensureRecipe(dish.id)
      const field = target.dataset.field
      if (!recipe[field]) recipe[field] = []
      recipe[field].push(recipeItemDefault(field))
      saveState()
      recordLog('厨师编辑配方', `${dish.name} 新增 ${field}`, { dishId: dish.id, field })
      render()
    }
    if (action === 'deleteRecipeItem') {
      if (!requireDatabase('编辑配方')) return
      const dish = dishById(ui.editingDishId)
      if (!dish) return
      const recipe = ensureRecipe(dish.id)
      const field = target.dataset.field
      const index = Number(target.dataset.index)
      if (!recipe[field] || index < 0 || index >= recipe[field].length) return
      recipe[field].splice(index, 1)
      saveState()
      recordLog('厨师编辑配方', `${dish.name} 删除 ${field}`, { dishId: dish.id, field })
      render()
    }
    if (action === 'moveRecipeStep') {
      if (!requireDatabase('编辑配方')) return
      const dish = dishById(ui.editingDishId)
      if (!dish) return
      const recipe = ensureRecipe(dish.id)
      if (!recipe.steps) recipe.steps = []
      const index = Number(target.dataset.index)
      const nextIndex = index + Number(target.dataset.direction)
      if (nextIndex < 0 || nextIndex >= recipe.steps.length) return
      const steps = recipe.steps
      ;[steps[index], steps[nextIndex]] = [steps[nextIndex], steps[index]]
      saveState()
      recordLog('厨师编辑配方', `${dish.name} 调整步骤顺序`, { dishId: dish.id, field: 'steps' })
      render()
    }
    if (action === 'toggleDishBool') {
      const dish = dishById(target.dataset.id)
      if (!dish) return
      const draft = getDishFlagDraft(dish)
      draft[target.dataset.field] = target.checked
      return
    }
    if (action === 'toggleDishTag') {
      if (!requireDatabase('编辑菜品标签')) return
      const dish = dishById(target.dataset.id)
      if (!dish) return
      const tag = normalizeDishTag(target.dataset.tag)
      const tags = displayTags(dish.tags || [])
      const exists = tags.includes(tag)
      dish.tags = exists ? tags.filter((item) => item !== tag) : uniqueNames([...tags, tag])
      if (tag === FAVORITE_TAG) {
        dish.isFavorite = !exists
        getDishFlagDraft(dish).isFavorite = dish.isFavorite
      }
      saveState({ dbDelay: 60 })
      scheduleDishTagLog(dish)
      target.classList.toggle('active', !exists)
      const favoriteCheckbox = app.querySelector(`[data-action="toggleDishBool"][data-id="${dish.id}"][data-field="isFavorite"]`)
      if (favoriteCheckbox && tag === FAVORITE_TAG) favoriteCheckbox.checked = dish.isFavorite
      return
    }
    if (action === 'confirmDishFlags') {
      if (!requireDatabase('确认菜品状态')) return
      const dish = dishById(target.dataset.id)
      if (!dish) return
      const draft = getDishFlagDraft(dish)
      dish.isListed = Boolean(draft.isListed)
      dish.isFavorite = Boolean(draft.isFavorite)
      const tags = displayTags(dish.tags || [])
      dish.tags = dish.isFavorite ? uniqueNames([...tags, FAVORITE_TAG]) : tags.filter((tag) => tag !== FAVORITE_TAG)
      saveState({ dbDelay: 60 })
      recordLog('厨师确认菜品状态', `${dish.name}：${dish.isListed ? '上架' : '下架'}，${dish.isFavorite ? FAVORITE_TAG : '普通'}`, { dishId: dish.id, isListed: dish.isListed, isFavorite: dish.isFavorite })
      showToast('菜品状态已同步到顾客端')
      render()
      return
    }
    if (action === 'deleteDish') return deleteDish(target.dataset.id)
    if (action === 'clearLogFilters') {
      ui.logKeyword = ''
      ui.logDate = ''
      render()
      return
    }
    if (action === 'toggleStateSnapshot') {
      ui.showStateSnapshot = !ui.showStateSnapshot
      render()
      return
    }
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
        showToast(emailErrorMessage(error))
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
    if (event.key === 'Enter' && event.target && ['customerName', 'customerPassword'].includes(event.target.id)) {
      event.preventDefault()
      const button = app.querySelector('[data-action="unlockCustomer"]')
      if (button) button.click()
    }
    if (event.key === 'Enter' && event.target && event.target.id === 'chefPassword') {
      event.preventDefault()
      const button = app.querySelector('[data-action="unlockChef"]')
      if (button) button.click()
    }
    if (event.key === 'Enter' && event.target && event.target.id === 'settingsPassword') {
      event.preventDefault()
      unlockSettingsPanel()
    }
    if ((event.key === 'Enter' || event.key === ' ') && event.target && typeof event.target.closest === 'function') {
      const orderLine = event.target.closest('[data-action="selectOrder"][data-id]')
      if (!orderLine) return
      event.preventDefault()
      ui.selectedOrderId = orderLine.dataset.id
      render()
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('.top-tabs [data-view]')
    if (!button) return
    switchView(button.dataset.view)
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
        saveState()
      } catch (error) {
        console.error(error)
        dbReady = false
        dbMessage = '数据库连接失败，请检查 Supabase URL、anon key、表结构和 RLS 策略'
      }
    }
    dbLoading = false
    importOrderFromHash()
    render()
    void compactStoredDishImages()
  }

  boot()
})()
