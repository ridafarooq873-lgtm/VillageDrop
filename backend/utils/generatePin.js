/**
 * Generate a numeric pickup/delivery PIN of given length.
 * @param {number} length
 */
export function generatePin(length = 4) {
  let pin = ''
  for (let i = 0; i < length; i++) {
    pin += Math.floor(Math.random() * 10).toString()
  }
  return pin
}

export default generatePin
