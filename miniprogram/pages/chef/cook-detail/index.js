const { call, showError } = require('../../../utils/api')

Page({
  data: {
    id: '',
    cookItems: []
  },

  onLoad(options) {
    this.setData({ id: options.id })
    this.loadCookDetail()
  },

  loadCookDetail() {
    call('getCookDetail', { orderId: this.data.id }).then((data) => {
      const cookItems = (data.cookItems || []).map((item) => ({
        ...item,
        tasteOptionsText: (item.tasteOptions || []).join('、')
      }))
      this.setData({ cookItems })
    }).catch(showError)
  },

  finishOrder() {
    wx.showModal({
      title: '完成出餐',
      content: '确认已经做好了吗？确认后会扣减库存。',
      success: (res) => {
        if (!res.confirm) return
        call('finishOrder', { orderId: this.data.id }).then(() => {
          wx.showToast({ title: '可以吃啦' })
          wx.navigateBack()
        }).catch(showError)
      }
    })
  }
})

