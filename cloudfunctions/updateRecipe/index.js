const { handle } = require('./shared')

exports.main = async (event) => handle('updateRecipe', event)

