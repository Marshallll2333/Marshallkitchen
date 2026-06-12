Page({
  data: {
    user: {},
    tastePreferences: []
  },

  onShow() {
    const app = getApp()
    const user = app.globalData.user || {}
    this.setData({
      user,
      tastePreferences: user.tastePreferences || []
    })
  },

  goOrders() {
    wx.navigateTo({ url: '/pages/customer/orders/index' })
  }
})

