const { call, showError } = require('../../../utils/api')
const { orderStatusText, formatDate } = require('../../../utils/format')

Page({
  data: {
    id: '',
    order: null
  },

  onLoad(options) {
    this.setData({ id: options.id })
  },

  onShow() {
    this.loadOrder()
  },

  loadOrder() {
    call('getOrderDetail', { orderId: this.data.id }).then((data) => {
      const order = data.order
      order.statusText = orderStatusText(order.status, 'chef')
      order.createdAtText = formatDate(order.createdAt)
      order.items = (order.items || []).map((item) => ({
        ...item,
        tasteOptionsText: (item.tasteOptions || []).join('、')
      }))
      this.setData({ order })
    }).catch(showError)
  },

  acceptOrder() {
    call('acceptOrder', { orderId: this.data.id }).then(() => this.loadOrder()).catch(showError)
  },

  startCooking() {
    call('startCooking', { orderId: this.data.id }).then(() => {
      wx.navigateTo({ url: `/pages/chef/cook-detail/index?id=${this.data.id}` })
    }).catch(showError)
  },

  openCookDetail() {
    wx.navigateTo({ url: `/pages/chef/cook-detail/index?id=${this.data.id}` })
  },

  cancelOrder() {
    wx.showModal({
      title: '取消订单',
      content: '确定暂时不做这单吗？',
      success: (res) => {
        if (!res.confirm) return
        call('cancelOrder', { orderId: this.data.id }).then(() => this.loadOrder()).catch(showError)
      }
    })
  },

  editRecipe(event) {
    wx.navigateTo({
      url: `/pages/chef/recipe-edit/index?dishId=${event.currentTarget.dataset.dish}`
    })
  }
})

