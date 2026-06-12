const { TASTE_OPTIONS } = require('./constants')

function toggleTaste(current, taste) {
  const next = current ? current.slice() : []
  const index = next.indexOf(taste)
  if (index >= 0) {
    next.splice(index, 1)
  } else {
    next.push(taste)
  }
  return next
}

function includesTaste(current, taste) {
  return (current || []).indexOf(taste) >= 0
}

module.exports = {
  TASTE_OPTIONS,
  toggleTaste,
  includesTaste
}

