function goCustomerHome() {
  wx.redirectTo({ url: '/pages/customer/home/index' })
}

function goChefHome() {
  wx.redirectTo({ url: '/pages/chef/dashboard/index' })
}

function goPrivate(openid) {
  const query = openid ? `?openid=${encodeURIComponent(openid)}` : ''
  wx.redirectTo({ url: `/pages/private/private${query}` })
}

module.exports = {
  goCustomerHome,
  goChefHome,
  goPrivate
}

