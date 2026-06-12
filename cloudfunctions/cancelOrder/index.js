const { handle } = require('./shared')

exports.main = async (event) => handle('cancelOrder', event)

