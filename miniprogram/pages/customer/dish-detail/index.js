const { call, showError } = require('../../../utils/api')
const { TASTE_OPTIONS, toggleTaste } = require('../../../utils/taste')

Page({
  data: {
    id: '',
    dish: null,
    tasteOptions: TASTE_OPTIONS,
    selectedTaste: [],
    selectedTasteMap: {},
    remark: '',
    quantity: 1
  },

  onLoad(options) {
    this.setData({ id: options.id })
    this.loadDish()
  },

  loadDish() {
    call('getDishDetail', { dishId: this.data.id })
      .then((data) => {
        this.setData({ dish: data.dish })
      })
      .catch(showError)
  },

  toggleTaste(event) {
    const taste = event.currentTarget.dataset.taste
    const selectedTaste = toggleTaste(this.data.selectedTaste, taste)
    const selectedTasteMap = {}
    selectedTaste.forEach((item) => {
      selectedTasteMap[item] = true
    })
    this.setData({ selectedTaste, selectedTasteMap })
  },

  onRemarkInput(event) {
    this.setData({ remark: event.detail.value })
  },

  adjustQuantity(event) {
    const delta = Number(event.currentTarget.dataset.delta)
    const quantity = Math.max(1, this.data.quantity + delta)
    this.setData({ quantity })
  },

  addToCart() {
    call('updateCart', {
      action: 'add',
      dishId: this.data.id,
      quantity: this.data.quantity,
      tasteOptions: this.data.selectedTaste,
      remark: this.data.remark
    }).then(() => {
      wx.showToast({ title: '已加入点菜单' })
      wx.navigateTo({ url: '/pages/customer/cart/index' })
    }).catch(showError)
  }
})

