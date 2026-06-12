const { call, showError } = require('../../../utils/api')
const { formatDate } = require('../../../utils/format')

Page({
  data: {
    orders: [],
    summary: {
      submitted: 0,
      cooking: 0,
      ready: 0
    }
  },

  onShow() {
    this.loadOrders()
  },

  loadOrders() {
    call('getChefOrders').then((data) => {
      const orders = (data.orders || []).map((order) => ({
        ...order,
        createdAtText: formatDate(order.createdAt)
      }))
      this.setData({
        orders,
        summary: data.summary || { submitted: 0, cooking: 0, ready: 0 }
      })
    }).catch(showError)
  },

  openOrder(event) {
    const order = event.detail.order
    wx.navigateTo({
      url: `/pages/chef/order-detail/index?id=${order._id}`
    })
  },

  goInventory() {
    wx.navigateTo({ url: '/pages/chef/inventory/index' })
  },

  goDishes() {
    wx.navigateTo({ url: '/pages/chef/dish-manage/index' })
  },

  goCustomerPreview() {
    wx.navigateTo({ url: '/pages/customer/home/index' })
  },

  goProfile() {
    wx.navigateTo({ url: '/pages/chef/profile/index' })
  }
})

