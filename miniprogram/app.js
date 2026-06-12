const config = require('./config')

App({
  globalData: {
    appName: config.appName,
    user: null,
    role: null,
    cloudReady: false
  },

  onLaunch() {
    if (!wx.cloud) {
      wx.showModal({
        title: '基础库版本过低',
        content: '请升级微信或微信开发者工具后再打开专属小厨房。',
        showCancel: false
      })
      return
    }

    const initOptions = { traceUser: true }
    if (config.cloudEnvId) {
      initOptions.env = config.cloudEnvId
    }

    wx.cloud.init(initOptions)
    this.globalData.cloudReady = true
  }
})

