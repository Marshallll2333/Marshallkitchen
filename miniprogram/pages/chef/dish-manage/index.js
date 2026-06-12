const { call, showError } = require('../../../utils/api')

const emptyForm = {
  _id: '',
  name: '',
  category: '家常菜',
  price: '',
  cookTime: '',
  emoji: '🍳',
  description: '',
  isListed: true,
  isFavorite: false
}

Page({
  data: {
    dishes: [],
    editing: false,
    form: { ...emptyForm }
  },

  onShow() {
    this.loadDishes()
  },

  loadDishes() {
    call('getAvailableDishes', { chefMode: true }).then((data) => {
      this.setData({ dishes: data.dishes || [] })
    }).catch(showError)
  },

  newDish() {
    this.setData({ editing: true, form: { ...emptyForm } })
  },

  editDish(event) {
    const dish = event.detail.dish
    this.setData({
      editing: true,
      form: {
        ...emptyForm,
        ...dish
      }
    })
  },

  onFormInput(event) {
    const field = event.currentTarget.dataset.field
    const form = { ...this.data.form, [field]: event.detail.value }
    this.setData({ form })
  },

  toggleBool(event) {
    const field = event.currentTarget.dataset.field
    const form = { ...this.data.form, [field]: !this.data.form[field] }
    this.setData({ form })
  },

  saveDish() {
    const form = {
      ...this.data.form,
      price: Number(this.data.form.price || 0),
      cookTime: Number(this.data.form.cookTime || 0)
    }
    const name = form._id ? 'updateDish' : 'createDish'
    const payload = form._id ? { dishId: form._id, patch: form } : { dish: form }
    call(name, payload).then(() => {
      this.setData({ editing: false, form: { ...emptyForm } })
      this.loadDishes()
    }).catch(showError)
  },

  cancelEdit() {
    this.setData({ editing: false, form: { ...emptyForm } })
  }
})

