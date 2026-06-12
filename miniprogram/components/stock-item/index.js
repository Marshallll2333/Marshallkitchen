Component({
  properties: {
    item: {
      type: Object,
      value: {}
    },
    targetType: {
      type: String,
      value: 'material'
    }
  },

  observers: {
    item(value) {
      const stock = Number(value.stock !== undefined ? value.stock : value.count)
      const safeStock = Number(value.safeStock || 0)
      this.setData({ low: stock <= safeStock })
    }
  },

  data: {
    low: false
  },

  methods: {
    handleAdjust(event) {
      const delta = Number(event.currentTarget.dataset.delta)
      this.triggerEvent('adjust', {
        item: this.data.item,
        targetType: this.data.targetType,
        delta
      })
    }
  }
})

