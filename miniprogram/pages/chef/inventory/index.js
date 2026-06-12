const { call, showError } = require('../../../utils/api')

Page({
  data: {
    activeTab: 'materials',
    tabs: [
      { key: 'materials', label: '原材料' },
      { key: 'seasonings', label: '调味料' },
      { key: 'tools', label: '工具' }
    ],
    materials: [],
    seasonings: [],
    tools: []
  },

  onShow() {
    this.loadInventory()
  },

  switchTab(event) {
    this.setData({ activeTab: event.currentTarget.dataset.key })
  },

  loadInventory() {
    call('getInventory').then((data) => {
      this.setData({
        materials: data.materials || [],
        seasonings: data.seasonings || [],
        tools: data.tools || []
      })
    }).catch(showError)
  },

  adjustStock(event) {
    const { item, targetType, delta } = event.detail
    const patch = {}
    const current = Number(item.stock || 0)
    patch.stock = Math.max(0, current + delta)
    call('updateInventory', {
      targetType,
      id: item._id,
      patch
    }).then(() => this.loadInventory()).catch(showError)
  },

  toggleTool(event) {
    const id = event.currentTarget.dataset.id
    const current = event.currentTarget.dataset.status
    const status = current === 'available' ? 'unavailable' : 'available'
    call('updateToolStatus', { toolId: id, status }).then(() => this.loadInventory()).catch(showError)
  }
})

