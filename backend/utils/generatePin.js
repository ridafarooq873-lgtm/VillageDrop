/**
 * Generate a 4-digit PIN for delivery verification
 * @returns {String} 4-digit PIN
 */
const generatePin = () => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

module.exports = generatePin;
