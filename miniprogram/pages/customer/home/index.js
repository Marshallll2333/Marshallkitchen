const { call, showError } = require('../../../utils/api')
const { CATEGORIES } = require('../../../utils/constants')

Page({
  data: {
    categories: CATEGORIES,
    category: '全部',
    keyword: '',
    dishes: [],
    cartCount: 0,
    loading: true
  },

  onShow() {
    this.loadDishes()
    this.loadCart()
  },

  onKeywordInput(event) {
    this.setData({ keyword: event.detail.value })
  },

  selectCategory(event) {
    this.setData({
      category: event.currentTarget.dataset.category
    }, () => this.loadDishes())
  },

  loadDishes() {
    this.setData({ loading: true })
    call('getAvailableDishes', {
      category: this.data.category,
      keyword: this.data.keyword
    }).then((data) => {
      this.setData({
        dishes: data.dishes || [],
        loading: false
      })
    }).catch((error) => {
      this.setData({ loading: false })
      showError(error)
    })
  },

  loadCart() {
    call('getCart').then((data) => {
      const items = data.cart && data.cart.items ? data.cart.items : []
      const cartCount = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
      this.setData({ cartCount })
    }).catch(() => {})
  },

  openDish(event) {
    const dish = event.detail.dish
    wx.navigateTo({
      url: `/pages/customer/dish-detail/index?id=${dish._id}`
    })
  },

  quickAdd(event) {
    const dish = event.detail.dish
    call('updateCart', {
      action: 'add',
      dishId: dish._id,
      quantity: 1,
      tasteOptions: [],
      remark: ''
    }).then(() => {
      wx.showToast({ title: '已加入点菜单' })
      this.loadCart()
    }).catch(showError)
  },

  goCart() {
    wx.navigateTo({ url: '/pages/customer/cart/index' })
  },

  goProfile() {
    wx.navigateTo({ url: '/pages/customer/profile/index' })
  }
})

