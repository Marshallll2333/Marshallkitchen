Page({
  data: {
    user: {}
  },

  onShow() {
    const app = getApp()
    this.setData({ user: app.globalData.user || {} })
  },

  goDashboard() {
    wx.navigateBack()
  },

  goInventory() {
    wx.navigateTo({ url: '/pages/chef/inventory/index' })
  },

  goDishes() {
    wx.navigateTo({ url: '/pages/chef/dish-manage/index' })
  }
})

