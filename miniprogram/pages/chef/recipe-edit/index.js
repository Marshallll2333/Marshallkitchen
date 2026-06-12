const { call, showError } = require('../../../utils/api')

function listToRaw(list, withAmount) {
  return (list || []).map((item) => {
    if (!withAmount) return item.name
    return `${item.name} ${item.amount} ${item.unit}`
  }).join('\n')
}

function parseAmountLines(raw) {
  return raw.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const parts = line.split(/\s+/)
    return {
      name: parts[0],
      amount: Number(parts[1] || 0),
      unit: parts[2] || ''
    }
  })
}

function parseNameLines(raw) {
  return raw.split('\n').map((line) => line.trim()).filter(Boolean).map((name) => ({ name }))
}

Page({
  data: {
    dishId: '',
    dish: {},
    materialsRaw: '',
    seasoningsRaw: '',
    toolsRaw: '',
    stepsRaw: ''
  },

  onLoad(options) {
    this.setData({ dishId: options.dishId })
    this.loadRecipe()
  },

  loadRecipe() {
    call('getDishDetail', { dishId: this.data.dishId, includeRecipe: true }).then((data) => {
      const recipe = data.recipe || {}
      this.setData({
        dish: data.dish || {},
        materialsRaw: listToRaw(recipe.materials, true),
        seasoningsRaw: listToRaw(recipe.seasonings, true),
        toolsRaw: listToRaw(recipe.tools, false),
        stepsRaw: (recipe.steps || []).join('\n')
      })
    }).catch(showError)
  },

  onMaterialsInput(event) {
    this.setData({ materialsRaw: event.detail.value })
  },

  onSeasoningsInput(event) {
    this.setData({ seasoningsRaw: event.detail.value })
  },

  onToolsInput(event) {
    this.setData({ toolsRaw: event.detail.value })
  },

  onStepsInput(event) {
    this.setData({ stepsRaw: event.detail.value })
  },

  saveRecipe() {
    const recipe = {
      dishId: this.data.dishId,
      materials: parseAmountLines(this.data.materialsRaw),
      seasonings: parseAmountLines(this.data.seasoningsRaw),
      tools: parseNameLines(this.data.toolsRaw),
      steps: this.data.stepsRaw.split('\n').map((line) => line.trim()).filter(Boolean)
    }
    call('updateRecipe', { dishId: this.data.dishId, recipe })
      .then(() => wx.showToast({ title: '配方已保存' }))
      .catch(showError)
  }
})

