const { call, showError } = require('../../../utils/api')
const { estimateCookTime } = require('../../../utils/format')

Page({
  data: {
    items: [],
    totalPrice: 0,
    remark: '',
    estimateTime: '约 0 分钟',
    expectedTime: '现在就吃',
    timeOptions: ['现在就吃', '30分钟后', '今晚再吃']
  },

  onShow() {
    this.loadCart()
  },

  loadCart() {
    call('getCart').then((data) => {
      const cart = data.cart || {}
      const items = (cart.items || []).map((item) => ({
        ...item,
        tasteOptionsText: (item.tasteOptions || []).join('、')
      }))
      this.setData({
        items,
        totalPrice: cart.totalPrice || 0,
        remark: cart.remark || '',
        estimateTime: estimateCookTime(items)
      })
    }).catch(showError)
  },

  adjustItem(event) {
    const cartKey = event.currentTarget.dataset.key
    const delta = Number(event.currentTarget.dataset.delta)
    const item = this.data.items.find((entry) => entry.cartKey === cartKey)
    if (!item) return
    const quantity = item.quantity + delta
    call('updateCart', {
      action: quantity <= 0 ? 'remove' : 'setQuantity',
      cartKey,
      quantity
    }).then(() => this.loadCart()).catch(showError)
  },

  onRemarkInput(event) {
    const remark = event.detail.value
    this.setData({ remark })
    call('updateCart', {
      action: 'remark',
      remark
    }).catch(() => {})
  },

  selectTime(event) {
    this.setData({ expectedTime: event.currentTarget.dataset.time })
  },

  submitOrder() {
    if (!this.data.items.length) {
      wx.showToast({ title: '先选一道菜吧', icon: 'none' })
      return
    }

    call('submitOrder', {
      remark: this.data.remark,
      expectedTime: this.data.expectedTime
    }).then((data) => {
      wx.redirectTo({
        url: `/pages/customer/orders/index?orderId=${data.orderId}`
      })
    }).catch(showError)
  }
})

