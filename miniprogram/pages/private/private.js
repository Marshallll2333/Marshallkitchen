Page({
  data: {
    openid: ''
  },

  onLoad(options) {
    this.setData({
      openid: options.openid || ''
    })
  },

  copyOpenid() {
    if (!this.data.openid) return
    wx.setClipboardData({
      data: this.data.openid
    })
  }
})

