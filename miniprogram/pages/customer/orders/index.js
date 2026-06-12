const { call, showError } = require('../../../utils/api')
const { orderStatusText, formatDate } = require('../../../utils/format')

Page({
  data: {
    orderId: '',
    currentOrder: null,
    orders: []
  },

  onLoad(options) {
    this.setData({ orderId: options.orderId || '' })
  },

  onShow() {
    this.loadOrders()
  },

  loadOrders() {
    call('getMyOrders').then((data) => {
      const orders = (data.orders || []).map((order) => ({
        ...order,
        createdAtText: formatDate(order.createdAt)
      }))
      this.setData({ orders })
      const orderId = this.data.orderId
      if (orderId) {
        const current = orders.find((order) => order._id === orderId)
        if (current) {
          this.setData({
            currentOrder: {
              ...current,
              statusText: orderStatusText(current.status, 'customer')
            }
          })
        }
      }
    }).catch(showError)
  },

  openOrder(event) {
    const order = event.detail.order
    this.setData({
      orderId: order._id,
      currentOrder: {
        ...order,
        statusText: orderStatusText(order.status, 'customer')
      }
    })
  }
})

