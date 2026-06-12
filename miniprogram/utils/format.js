const { ORDER_STATUS, CHEF_STATUS } = require('./constants')

function money(value) {
  const number = Number(value || 0)
  return `￥${number.toFixed(number % 1 === 0 ? 0 : 1)}`
}

function orderStatusText(status, role) {
  return role === 'chef'
    ? (CHEF_STATUS[status] || status || '未知')
    : (ORDER_STATUS[status] || status || '未知')
}

function estimateCookTime(items) {
  const total = (items || []).reduce((sum, item) => {
    const cookTime = Number(item.cookTime || 0)
    const quantity = Number(item.quantity || 1)
    return sum + cookTime * quantity
  }, 0)
  if (!total) return '约 0 分钟'
  const minutes = Math.max(5, Math.ceil(total * 0.8))
  return `约 ${minutes} 分钟`
}

function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (num) => String(num).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

module.exports = {
  money,
  orderStatusText,
  estimateCookTime,
  formatDate
}

