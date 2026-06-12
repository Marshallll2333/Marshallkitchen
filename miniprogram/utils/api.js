function call(name, data) {
  return wx.cloud.callFunction({
    name,
    data: data || {}
  }).then((res) => {
    const result = res.result || {}
    if (!result.ok) {
      const message = result.message || '请求失败，请稍后再试'
      throw new Error(message)
    }
    return result.data
  })
}

function showError(error) {
  const message = error && error.message ? error.message : '操作失败'
  wx.showToast({
    title: message,
    icon: 'none',
    duration: 2200
  })
}

module.exports = {
  call,
  showError
}

