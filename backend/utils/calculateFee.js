/**
 * Calculate delivery fee
 * @param {Object} params - distance, weight, category, isFragile
 * @returns {Number} calculated fee
 */
const calculateFee = ({ distance = 1, weight = 1, category = 'parcel', isFragile = false }) => {
  const BASE_FEE = 30;
  const PER_KM_RATE = 10;
  
  let fee = BASE_FEE + (distance * PER_KM_RATE);
  
  // Weight surcharge
  if (weight > 5) {
    fee += (weight - 5) * 5; // Rs 5 per extra kg
  }
  
  // Category surcharge
  if (category === 'electronics') {
    fee += 50;
  }
  
  if (isFragile) {
    fee += 20;
  }
  
  return Math.round(fee);
};

module.exports = calculateFee;
