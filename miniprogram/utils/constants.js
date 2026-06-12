const ORDER_STATUS = {
  SUBMITTED: '已下单，等你接单',
  ACCEPTED: '你已接单',
  COOKING: '正在制作',
  READY: '可以吃啦',
  FINISHED: '已完成',
  CANCELLED: '已取消'
}

const CHEF_STATUS = {
  SUBMITTED: '待接单',
  ACCEPTED: '已接单',
  COOKING: '制作中',
  READY: '可出餐',
  FINISHED: '已完成',
  CANCELLED: '已取消'
}

const TASTE_OPTIONS = ['少盐', '少油', '不放葱', '不放蒜', '不辣']

const CATEGORIES = ['全部', '她爱吃', '家常菜', '主食', '凉菜', '汤']

module.exports = {
  ORDER_STATUS,
  CHEF_STATUS,
  TASTE_OPTIONS,
  CATEGORIES
}

