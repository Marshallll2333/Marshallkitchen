const { handle } = require('./shared')

exports.main = async (event) => handle('finishOrder', event)

