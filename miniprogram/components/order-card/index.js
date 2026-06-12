const { orderStatusText } = require('../../utils/format')

Component({
  properties: {
    order: {
      type: Object,
      value: {}
    },
    role: {
      type: String,
      value: 'customer'
    }
  },

  observers: {
    'order.status, role': function () {
      this.setData({
        statusText: orderStatusText(this.data.order.status, this.data.role)
      })
    }
  },

  data: {
    statusText: ''
  },

  methods: {
    handleTap() {
      this.triggerEvent('taporder', { order: this.data.order })
    }
  }
})

