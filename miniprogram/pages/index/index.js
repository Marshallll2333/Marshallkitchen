const { call, showError } = require('../../utils/api')
const { goCustomerHome, goChefHome, goPrivate } = require('../../utils/navigation')

Page({
  data: {
    failed: false
  },

  onLoad() {
    this.login()
  },

  login() {
    this.setData({ failed: false })
    call('login')
      .then((data) => {
        const app = getApp()
        app.globalData.user = data.user || null
        app.globalData.role = data.role || null

        if (data.role === 'chef') {
          goChefHome()
          return
        }

        if (data.role === 'customer') {
          goCustomerHome()
          return
        }

        goPrivate(data.openid)
      })
      .catch((error) => {
        this.setData({ failed: true })
        showError(error)
      })
  }
})

