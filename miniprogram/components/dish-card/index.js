Component({
  properties: {
    dish: {
      type: Object,
      value: {}
    },
    showAdd: {
      type: Boolean,
      value: true
    }
  },

  methods: {
    handleTap() {
      this.triggerEvent('tapdish', { dish: this.data.dish })
    },

    handleAdd() {
      this.triggerEvent('adddish', { dish: this.data.dish })
    }
  }
})

