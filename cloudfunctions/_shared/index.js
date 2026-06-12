const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

function ok(data) {
  return { ok: true, data }
}

function fail(error) {
  const message = error && error.message ? error.message : '云函数执行失败'
  return { ok: false, message }
}

function now() {
  return new Date().toISOString()
}

function collectionName(targetType) {
  const map = {
    material: 'materials',
    seasoning: 'seasonings',
    tool: 'tools'
  }
  return map[targetType] || targetType
}

async function list(name, where) {
  const query = where ? db.collection(name).where(where) : db.collection(name)
  const result = await query.limit(100).get()
  return result.data || []
}

async function getDoc(name, id) {
  const result = await db.collection(name).doc(id).get()
  return result.data
}

async function findOne(name, where) {
  const result = await db.collection(name).where(where).limit(1).get()
  return result.data && result.data[0]
}

async function getRoleConfig() {
  try {
    return await getDoc('app_config', 'roles')
  } catch (error) {
    return { chefOpenids: [], customerOpenids: [] }
  }
}

async function getUser(openid) {
  return findOne('users', { openid })
}

async function ensureRole(openid, allowedRoles) {
  const user = await getUser(openid)
  if (!user || allowedRoles.indexOf(user.role) < 0) {
    throw new Error('没有访问这个小厨房的权限')
  }
  return user
}

async function upsertUser(openid, role) {
  const existing = await getUser(openid)
  const patch = {
    openid,
    role,
    nickname: role === 'chef' ? '厨师' : '她',
    avatarUrl: '',
    tastePreferences: role === 'customer' ? ['少盐'] : [],
    updatedAt: now()
  }

  if (existing) {
    await db.collection('users').doc(existing._id).update({
      data: {
        role,
        updatedAt: patch.updatedAt
      }
    })
    return { ...existing, role }
  }

  const createdAt = now()
  await db.collection('users').add({
    data: {
      ...patch,
      createdAt
    }
  })
  return {
    ...patch,
    createdAt
  }
}

function findByRequest(items, request) {
  return (items || []).find((item) => {
    return item._id === request.materialId ||
      item._id === request.seasoningId ||
      item._id === request.toolId ||
      item.name === request.name
  })
}

function availabilityForDish(dish, recipe, inventory) {
  const reasons = []

  if (!dish || !dish.isListed) {
    reasons.push('菜品未上架')
  }

  if (!recipe) {
    reasons.push('还没有配置配方')
  }

  for (const request of (recipe && recipe.materials) || []) {
    const stock = findByRequest(inventory.materials, request)
    if (!stock || stock.stock < Number(request.amount || 0)) {
      reasons.push(`${request.name} 不足`)
    }
  }

  for (const request of (recipe && recipe.seasonings) || []) {
    const stock = findByRequest(inventory.seasonings, request)
    if (!stock || stock.stock < Number(request.amount || 0)) {
      reasons.push(`${request.name} 不足`)
    }
  }

  for (const request of (recipe && recipe.tools) || []) {
    const tool = findByRequest(inventory.tools, request)
    if (!tool || tool.status !== 'available' || Number(tool.count || 0) <= 0) {
      reasons.push(`${request.name} 不可用`)
    }
  }

  return {
    available: reasons.length === 0,
    missingReasons: reasons
  }
}

async function getInventorySnapshot() {
  const [materials, seasonings, tools] = await Promise.all([
    list('materials'),
    list('seasonings'),
    list('tools')
  ])
  return { materials, seasonings, tools }
}

async function getRecipeMap() {
  const recipes = await list('recipes')
  return recipes.reduce((map, recipe) => {
    map[recipe.dishId] = recipe
    return map
  }, {})
}

function decorateDish(dish, recipe, inventory) {
  const availability = availabilityForDish(dish, recipe, inventory)
  return {
    ...dish,
    available: availability.available,
    missingReasons: availability.missingReasons
  }
}

function createCartKey(dishId, tasteOptions, remark) {
  const tastes = (tasteOptions || []).slice().sort().join('|')
  return `${dishId}::${tastes}::${remark || ''}`
}

function calculateCartTotal(items) {
  return (items || []).reduce((sum, item) => {
    return sum + Number(item.price || 0) * Number(item.quantity || 0)
  }, 0)
}

async function getOrCreateCart(openid) {
  const cart = await findOne('carts', { userOpenid: openid })
  if (cart) return cart
  const data = {
    userOpenid: openid,
    items: [],
    totalPrice: 0,
    remark: '',
    updatedAt: now()
  }
  const result = await db.collection('carts').add({ data })
  return { _id: result._id, ...data }
}

function includesPreference(tasteOptions, remark, key) {
  return (tasteOptions || []).indexOf(key) >= 0 || (remark || '').indexOf(key) >= 0
}

function adjustListAmount(list, names, ratioOrAmount, mode) {
  return (list || []).map((item) => {
    if (names.indexOf(item.name) < 0) return item
    const amount = Number(item.amount || 0)
    const nextAmount = mode === 'set' ? ratioOrAmount : amount * ratioOrAmount
    return {
      ...item,
      amount: Number(nextAmount.toFixed(2))
    }
  })
}

function multiplyList(list, quantity) {
  return (list || []).map((item) => ({
    ...item,
    amount: Number((Number(item.amount || 0) * Number(quantity || 1)).toFixed(2))
  }))
}

function adjustRecipe(recipe, item) {
  const quantity = Number(item.quantity || 1)
  let materials = (recipe.materials || []).map((entry) => ({ ...entry }))
  let seasonings = (recipe.seasonings || []).map((entry) => ({ ...entry }))
  const tasteOptions = item.tasteOptions || []
  const remark = `${item.remark || ''} ${item.orderRemark || ''}`

  if (includesPreference(tasteOptions, remark, '少盐')) {
    seasonings = adjustListAmount(seasonings, ['盐'], 0.5, 'ratio')
  }
  if (includesPreference(tasteOptions, remark, '少油')) {
    seasonings = adjustListAmount(seasonings, ['食用油', '大豆油', '油'], 0.7, 'ratio')
  }
  if (includesPreference(tasteOptions, remark, '不放葱')) {
    materials = adjustListAmount(materials, ['葱', '小葱', '葱花'], 0, 'set')
  }
  if (includesPreference(tasteOptions, remark, '不放蒜')) {
    materials = adjustListAmount(materials, ['蒜', '蒜瓣'], 0, 'set')
  }
  if (includesPreference(tasteOptions, remark, '不辣')) {
    seasonings = adjustListAmount(seasonings, ['辣椒油', '辣椒', '辣椒粉'], 0, 'set')
  }

  return {
    materials: multiplyList(materials, quantity),
    seasonings: multiplyList(seasonings, quantity),
    tools: (recipe.tools || []).map((entry) => ({ ...entry })),
    steps: recipe.steps || []
  }
}

async function buildCookItems(order) {
  const dishIds = (order.items || []).map((item) => item.dishId)
  const [dishes, recipes] = await Promise.all([
    Promise.all(dishIds.map((id) => getDoc('dishes', id))),
    Promise.all(dishIds.map((id) => findOne('recipes', { dishId: id })))
  ])

  return (order.items || []).map((item, index) => {
    const recipe = recipes[index] || { materials: [], seasonings: [], tools: [], steps: [] }
    return {
      ...item,
      cookTime: dishes[index] ? dishes[index].cookTime : 0,
      orderRemark: order.remark,
      recipe: adjustRecipe(recipe, { ...item, orderRemark: order.remark })
    }
  })
}

function collectRequirement(map, inventoryList, request) {
  const stock = findByRequest(inventoryList, request)
  if (!stock) {
    throw new Error(`${request.name} 没有库存记录`)
  }
  if (!map[stock._id]) {
    map[stock._id] = {
      name: request.name,
      stock: Number(stock.stock || 0),
      amount: 0,
      unit: request.unit || stock.unit || ''
    }
  }
  map[stock._id].amount += Number(request.amount || 0)
}

function assertRequirementMap(map) {
  Object.keys(map).forEach((key) => {
    const item = map[key]
    if (item.stock < item.amount) {
      throw new Error(`${item.name} 库存不足，需要 ${item.amount}${item.unit}，当前 ${item.stock}${item.unit}`)
    }
  })
}

function assertCookItemsAvailable(cookItems, inventory) {
  const materialRequirements = {}
  const seasoningRequirements = {}

  for (const cookItem of cookItems) {
    for (const material of cookItem.recipe.materials || []) {
      collectRequirement(materialRequirements, inventory.materials, material)
    }
    for (const seasoning of cookItem.recipe.seasonings || []) {
      collectRequirement(seasoningRequirements, inventory.seasonings, seasoning)
    }
    for (const toolRequest of cookItem.recipe.tools || []) {
      const tool = findByRequest(inventory.tools, toolRequest)
      if (!tool || tool.status !== 'available' || Number(tool.count || 0) <= 0) {
        throw new Error(`${toolRequest.name} 不可用`)
      }
    }
  }

  assertRequirementMap(materialRequirements)
  assertRequirementMap(seasoningRequirements)
}

async function assertOrderItemsAvailable(items, orderRemark) {
  const inventory = await getInventorySnapshot()
  const recipeMap = await getRecipeMap()
  const cookItems = []

  for (const item of items) {
    const dish = await getDoc('dishes', item.dishId)
    const recipe = recipeMap[item.dishId]
    const result = availabilityForDish(dish, recipe, inventory)
    if (!result.available) {
      throw new Error(`${item.name} 暂时做不了：${result.missingReasons.join('、')}`)
    }
    cookItems.push({
      ...item,
      recipe: adjustRecipe(recipe, { ...item, orderRemark })
    })
  }

  assertCookItemsAvailable(cookItems, inventory)
}

async function login(event, openid) {
  const config = await getRoleConfig()
  const chefOpenids = config.chefOpenids || []
  const customerOpenids = config.customerOpenids || []
  let role = ''

  if (chefOpenids.indexOf(openid) >= 0) {
    role = 'chef'
  } else if (customerOpenids.indexOf(openid) >= 0) {
    role = 'customer'
  }

  if (!role) {
    return {
      openid,
      role: 'guest',
      user: null,
      needsBinding: true
    }
  }

  const user = await upsertUser(openid, role)
  return { openid, role, user }
}

async function getAvailableDishes(event, openid) {
  const user = await ensureRole(openid, ['customer', 'chef'])
  const chefMode = Boolean(event.chefMode) && user.role === 'chef'
  const [dishes, recipes, inventory] = await Promise.all([
    list('dishes'),
    getRecipeMap(),
    getInventorySnapshot()
  ])

  const keyword = (event.keyword || '').trim()
  const category = event.category || '全部'
  let result = dishes.map((dish) => decorateDish(dish, recipes[dish._id], inventory))

  if (!chefMode) {
    result = result.filter((dish) => dish.isListed && dish.available)
  }

  if (category === '她爱吃') {
    result = result.filter((dish) => dish.isFavorite || (dish.tags || []).indexOf('她爱吃') >= 0)
  } else if (category && category !== '全部') {
    result = result.filter((dish) => dish.category === category)
  }

  if (keyword) {
    result = result.filter((dish) => {
      const haystack = [dish.name, dish.description, dish.category].concat(dish.tags || []).join(' ')
      return haystack.indexOf(keyword) >= 0
    })
  }

  return { dishes: result }
}

async function getDishDetail(event, openid) {
  const user = await ensureRole(openid, ['customer', 'chef'])
  const dish = await getDoc('dishes', event.dishId)
  const data = { dish }
  if (event.includeRecipe && user.role === 'chef') {
    data.recipe = await findOne('recipes', { dishId: event.dishId })
  }
  return data
}

async function getCart(event, openid) {
  await ensureRole(openid, ['customer'])
  const cart = await getOrCreateCart(openid)
  return { cart }
}

async function updateCart(event, openid) {
  await ensureRole(openid, ['customer'])
  const cart = await getOrCreateCart(openid)
  let items = cart.items || []
  let remark = cart.remark || ''

  if (event.action === 'add') {
    const dish = await getDoc('dishes', event.dishId)
    if (!dish || !dish.isListed) throw new Error('这个菜暂时不能点')
    const tasteOptions = event.tasteOptions || []
    const itemRemark = event.remark || ''
    const cartKey = createCartKey(event.dishId, tasteOptions, itemRemark)
    const existing = items.find((item) => item.cartKey === cartKey)
    if (existing) {
      existing.quantity += Number(event.quantity || 1)
    } else {
      items.push({
        cartKey,
        dishId: event.dishId,
        name: dish.name,
        price: dish.price,
        cookTime: dish.cookTime,
        emoji: dish.emoji,
        quantity: Number(event.quantity || 1),
        tasteOptions,
        remark: itemRemark
      })
    }
  }

  if (event.action === 'setQuantity') {
    items = items.map((item) => item.cartKey === event.cartKey ? { ...item, quantity: Number(event.quantity || 1) } : item)
  }

  if (event.action === 'remove') {
    items = items.filter((item) => item.cartKey !== event.cartKey)
  }

  if (event.action === 'clear') {
    items = []
    remark = ''
  }

  if (event.action === 'remark') {
    remark = event.remark || ''
  }

  const totalPrice = calculateCartTotal(items)
  await db.collection('carts').doc(cart._id).update({
    data: {
      items,
      remark,
      totalPrice,
      updatedAt: now()
    }
  })

  return {
    cart: {
      ...cart,
      items,
      remark,
      totalPrice
    }
  }
}

async function submitOrder(event, openid) {
  await ensureRole(openid, ['customer'])
  const cart = await getOrCreateCart(openid)
  const items = cart.items || []
  if (!items.length) throw new Error('点菜单还是空的')

  await assertOrderItemsAvailable(items, event.remark || cart.remark || '')

  const date = new Date()
  const orderNo = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}${String(date.getSeconds()).padStart(2, '0')}`
  const order = {
    orderNo,
    customerOpenid: openid,
    status: 'SUBMITTED',
    items,
    totalPrice: cart.totalPrice || calculateCartTotal(items),
    remark: event.remark || cart.remark || '',
    expectedTime: event.expectedTime || '现在就吃',
    createdAt: now(),
    acceptedAt: null,
    startedAt: null,
    readyAt: null,
    finishedAt: null,
    cancelledAt: null
  }

  const result = await db.collection('orders').add({ data: order })
  await db.collection('carts').doc(cart._id).update({
    data: {
      items: [],
      remark: '',
      totalPrice: 0,
      updatedAt: now()
    }
  })

  return { orderId: result._id, order: { _id: result._id, ...order } }
}

async function getMyOrders(event, openid) {
  await ensureRole(openid, ['customer'])
  const orders = await db.collection('orders')
    .where({ customerOpenid: openid })
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get()
  return { orders: orders.data || [] }
}

async function getOrderDetail(event, openid) {
  const user = await ensureRole(openid, ['customer', 'chef'])
  const order = await getDoc('orders', event.orderId)
  if (user.role === 'customer' && order.customerOpenid !== openid) {
    throw new Error('不能查看别人的订单')
  }
  return { order }
}

async function getChefOrders(event, openid) {
  await ensureRole(openid, ['chef'])
  const result = await db.collection('orders')
    .where({ status: _.in(['SUBMITTED', 'ACCEPTED', 'COOKING', 'READY']) })
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get()
  const orders = result.data || []
  const summary = {
    submitted: orders.filter((order) => order.status === 'SUBMITTED').length,
    cooking: orders.filter((order) => order.status === 'COOKING').length,
    ready: orders.filter((order) => order.status === 'READY').length
  }
  return { orders, summary }
}

async function acceptOrder(event, openid) {
  await ensureRole(openid, ['chef'])
  await db.collection('orders').doc(event.orderId).update({
    data: {
      status: 'ACCEPTED',
      acceptedAt: now()
    }
  })
  return { orderId: event.orderId }
}

async function startCooking(event, openid) {
  await ensureRole(openid, ['chef'])
  const order = await getDoc('orders', event.orderId)
  if (['READY', 'FINISHED', 'CANCELLED'].indexOf(order.status) >= 0) {
    throw new Error('这个订单已经不能开始制作')
  }
  await assertOrderItemsAvailable(order.items || [], order.remark || '')
  await db.collection('orders').doc(event.orderId).update({
    data: {
      status: 'COOKING',
      startedAt: now()
    }
  })
  return { orderId: event.orderId }
}

async function getCookDetail(event, openid) {
  await ensureRole(openid, ['chef'])
  const order = await getDoc('orders', event.orderId)
  const cookItems = await buildCookItems(order)
  return { order, cookItems }
}

async function finishOrder(event, openid) {
  await ensureRole(openid, ['chef'])
  const order = await getDoc('orders', event.orderId)
  if (['READY', 'FINISHED'].indexOf(order.status) >= 0) {
    throw new Error('这个订单已经完成过了')
  }
  if (order.status === 'CANCELLED') {
    throw new Error('已取消的订单不能完成')
  }

  const cookItems = await buildCookItems(order)
  const inventory = await getInventorySnapshot()
  assertCookItemsAvailable(cookItems, inventory)
  for (const cookItem of cookItems) {
    for (const material of cookItem.recipe.materials || []) {
      const stock = findByRequest(inventory.materials, material)
      if (!stock) throw new Error(`${material.name} 没有库存记录`)
      await db.collection('materials').doc(stock._id).update({
        data: { stock: _.inc(-Number(material.amount || 0)), updatedAt: now() }
      })
      await db.collection('stock_logs').add({
        data: {
          type: 'deduct',
          targetType: 'material',
          targetId: stock._id,
          name: material.name,
          amount: Number(material.amount || 0),
          unit: material.unit || stock.unit || '',
          relatedOrderId: event.orderId,
          createdAt: now()
        }
      })
    }

    for (const seasoning of cookItem.recipe.seasonings || []) {
      const stock = findByRequest(inventory.seasonings, seasoning)
      if (!stock) throw new Error(`${seasoning.name} 没有库存记录`)
      await db.collection('seasonings').doc(stock._id).update({
        data: { stock: _.inc(-Number(seasoning.amount || 0)), updatedAt: now() }
      })
      await db.collection('stock_logs').add({
        data: {
          type: 'deduct',
          targetType: 'seasoning',
          targetId: stock._id,
          name: seasoning.name,
          amount: Number(seasoning.amount || 0),
          unit: seasoning.unit || stock.unit || '',
          relatedOrderId: event.orderId,
          createdAt: now()
        }
      })
    }
  }

  await db.collection('orders').doc(event.orderId).update({
    data: {
      status: 'READY',
      readyAt: now()
    }
  })

  return { orderId: event.orderId, status: 'READY' }
}

async function cancelOrder(event, openid) {
  await ensureRole(openid, ['chef'])
  await db.collection('orders').doc(event.orderId).update({
    data: {
      status: 'CANCELLED',
      cancelledAt: now()
    }
  })
  return { orderId: event.orderId }
}

async function getInventory(event, openid) {
  await ensureRole(openid, ['chef'])
  return getInventorySnapshot()
}

async function updateInventory(event, openid) {
  await ensureRole(openid, ['chef'])
  const name = collectionName(event.targetType)
  const patch = {
    ...(event.patch || {}),
    updatedAt: now()
  }
  await db.collection(name).doc(event.id).update({ data: patch })
  return { id: event.id }
}

async function createDish(event, openid) {
  await ensureRole(openid, ['chef'])
  const dish = event.dish || {}
  delete dish._id
  const data = {
    name: dish.name,
    category: dish.category || '家常菜',
    price: Number(dish.price || 0),
    costPrice: Number(dish.costPrice || 0),
    cookTime: Number(dish.cookTime || 0),
    emoji: dish.emoji || '🍳',
    imageUrl: dish.imageUrl || '',
    description: dish.description || '',
    tags: dish.tags || [],
    isFavorite: Boolean(dish.isFavorite),
    isListed: dish.isListed !== false,
    createdAt: now(),
    updatedAt: now()
  }
  const result = await db.collection('dishes').add({ data })
  return { dishId: result._id }
}

async function updateDish(event, openid) {
  await ensureRole(openid, ['chef'])
  const patch = event.patch || {}
  delete patch._id
  delete patch.available
  delete patch.missingReasons
  await db.collection('dishes').doc(event.dishId).update({
    data: {
      ...patch,
      price: Number(patch.price || 0),
      cookTime: Number(patch.cookTime || 0),
      updatedAt: now()
    }
  })
  return { dishId: event.dishId }
}

async function updateRecipe(event, openid) {
  await ensureRole(openid, ['chef'])
  const recipe = {
    ...(event.recipe || {}),
    dishId: event.dishId,
    updatedAt: now()
  }
  const existing = await findOne('recipes', { dishId: event.dishId })
  if (existing) {
    await db.collection('recipes').doc(existing._id).update({ data: recipe })
  } else {
    await db.collection('recipes').add({
      data: {
        ...recipe,
        createdAt: now()
      }
    })
  }
  return { dishId: event.dishId }
}

async function updateToolStatus(event, openid) {
  await ensureRole(openid, ['chef'])
  await db.collection('tools').doc(event.toolId).update({
    data: {
      status: event.status,
      updatedAt: now()
    }
  })
  return { toolId: event.toolId, status: event.status }
}

const handlers = {
  login,
  getAvailableDishes,
  getDishDetail,
  getCart,
  updateCart,
  submitOrder,
  getMyOrders,
  getOrderDetail,
  getChefOrders,
  acceptOrder,
  startCooking,
  getCookDetail,
  finishOrder,
  cancelOrder,
  getInventory,
  updateInventory,
  createDish,
  updateDish,
  updateRecipe,
  updateToolStatus
}

async function handle(name, event) {
  try {
    const context = cloud.getWXContext()
    if (!handlers[name]) {
      throw new Error(`未知云函数：${name}`)
    }
    const data = await handlers[name](event || {}, context.OPENID)
    return ok(data)
  } catch (error) {
    console.error(name, error)
    return fail(error)
  }
}

module.exports = {
  handle
}
