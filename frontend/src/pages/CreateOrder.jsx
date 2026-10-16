import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Package, ShoppingCart } from 'lucide-react';
import toast from 'react-hot-toast';
import { createOrder } from '../api/customerApi';
import { formatPKR } from '../utils/currency.js';
import './CreateOrder.css';

const CATEGORIES = ['document', 'parcel', 'food', 'grocery', 'medicine', 'electronics', 'clothing', 'other'];

const emptyItem = () => ({ name: '', description: '', quantity: 1, weight: 1, category: 'parcel', fragile: false });

const ESTIMATED_DISTANCE = 5;

const estimateFee = ({ items, isRap, estimatedItemCost }) => {
  let fee = 30 + ESTIMATED_DISTANCE * 10;
  if (!isRap) {
    const totalWeight = items.reduce((sum, item) => sum + (Number(item.weight) || 0) * (Number(item.quantity) || 1), 0);
    if (totalWeight > 5) fee += (totalWeight - 5) * 5;
    if (items.some((item) => item.category === 'electronics')) fee += 50;
    if (items.some((item) => item.fragile)) fee += 20;
  } else {
    fee += 20;
  }
  fee = Math.round(fee);
  return isRap ? fee + (Number(estimatedItemCost) || 0) : fee;
};

const CreateOrder = () => {
  const navigate = useNavigate();
  const [orderType, setOrderType] = useState('pickup_delivery');
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    pickup: { address: '', landmark: '', contactName: '', contactPhone: '', instructions: '' },
    delivery: { address: '', landmark: '', contactName: '', contactPhone: '', instructions: '' },
    purchaseDetails: { instructions: '', estimatedItemCost: '' },
    paymentMethod: 'cod',
    items: [emptyItem()],
  });

  const isRap = orderType === 'rider_assisted_purchase';

  const updateField = (section, key, value) =>
    setFormData((prev) => ({ ...prev, [section]: { ...prev[section], [key]: value } }));

  const updateItem = (index, key, value) =>
    setFormData((prev) => {
      const items = [...prev.items];
      items[index] = { ...items[index], [key]: value };
      return { ...prev, items };
    });

  const addItem = () => setFormData((prev) => ({ ...prev, items: [...prev.items, emptyItem()] }));

  const removeItem = (index) =>
    setFormData((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));

  const estimate = estimateFee({
    items: formData.items,
    isRap,
    estimatedItemCost: formData.purchaseDetails.estimatedItemCost,
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isRap && !formData.purchaseDetails.instructions.trim()) {
      return toast.error('Please add purchase instructions');
    }

    setLoading(true);
    try {
      const payload = {
        orderType,
        pickup: formData.pickup,
        delivery: formData.delivery,
        paymentMethod: formData.paymentMethod,
      };

      if (isRap) {
        payload.purchaseDetails = {
          instructions: formData.purchaseDetails.instructions,
          estimatedItemCost: Number(formData.purchaseDetails.estimatedItemCost) || 0,
        };
      } else {
        payload.items = formData.items.map((item) => ({
          ...item,
          quantity: Number(item.quantity) || 1,
          weight: Number(item.weight) || 0,
        }));
      }

      const { data } = await createOrder(payload);
      toast.success(`Order ${data.data.orderNumber} created!`);
      navigate(`/orders/${data.data._id}`);
    } catch (error) {
      const message = error.response?.data?.message ||
        error.response?.data?.errors?.[0]?.msg ||
        'Failed to create order';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="create-order-container">
      <h1>Create New Request</h1>

      <div className="card form-section">
        <h2>Order Type</h2>
        <div className="payment-options">
          <label className="radio-label">
            <input
              type="radio"
              name="orderType"
              checked={orderType === 'pickup_delivery'}
              onChange={() => setOrderType('pickup_delivery')}
            />
            <Package size={18} /> Pickup &amp; Delivery
          </label>
          <label className="radio-label">
            <input
              type="radio"
              name="orderType"
              checked={orderType === 'rider_assisted_purchase'}
              onChange={() => setOrderType('rider_assisted_purchase')}
            />
            <ShoppingCart size={18} /> Rider-Assisted Purchase
          </label>
        </div>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.75rem', fontSize: '0.9rem' }}>
          {isRap
            ? 'A rider will buy the items on your behalf and deliver them to you.'
            : 'A rider picks up your package and delivers it to the recipient.'}
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="card form-section">
          <h2>{isRap ? 'Shop / Store Details' : 'Pickup Details'}</h2>
          <div className="location-grid">
            <div className="form-group full-width">
              <label>{isRap ? 'Shop Address' : 'Pickup Address'} *</label>
              <input
                className="form-control"
                required
                placeholder="Village / street / landmark"
                value={formData.pickup.address}
                onChange={(e) => updateField('pickup', 'address', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Landmark</label>
              <input
                className="form-control"
                placeholder="Near..."
                value={formData.pickup.landmark}
                onChange={(e) => updateField('pickup', 'landmark', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>{isRap ? 'Shop Contact Name' : 'Sender Name'}</label>
              <input
                className="form-control"
                placeholder="Contact person"
                value={formData.pickup.contactName}
                onChange={(e) => updateField('pickup', 'contactName', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>{isRap ? 'Shop Phone' : 'Sender Phone'}</label>
              <input
                className="form-control"
                placeholder="10-digit number"
                value={formData.pickup.contactPhone}
                onChange={(e) => updateField('pickup', 'contactPhone', e.target.value)}
              />
            </div>
            <div className="form-group full-width">
              <label>Instructions</label>
              <input
                className="form-control"
                placeholder="Any special notes for pickup"
                value={formData.pickup.instructions}
                onChange={(e) => updateField('pickup', 'instructions', e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="card form-section">
          <h2>Delivery Details</h2>
          <div className="location-grid">
            <div className="form-group full-width">
              <label>Delivery Address *</label>
              <input
                className="form-control"
                required
                placeholder="Village / street / landmark"
                value={formData.delivery.address}
                onChange={(e) => updateField('delivery', 'address', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Landmark</label>
              <input
                className="form-control"
                placeholder="Near..."
                value={formData.delivery.landmark}
                onChange={(e) => updateField('delivery', 'landmark', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Recipient Name *</label>
              <input
                className="form-control"
                required
                placeholder="Contact person"
                value={formData.delivery.contactName}
                onChange={(e) => updateField('delivery', 'contactName', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Recipient Phone *</label>
              <input
                className="form-control"
                required
                placeholder="10-digit number"
                value={formData.delivery.contactPhone}
                onChange={(e) => updateField('delivery', 'contactPhone', e.target.value)}
              />
            </div>
            <div className="form-group full-width">
              <label>Instructions</label>
              <input
                className="form-control"
                placeholder="Any special notes for delivery"
                value={formData.delivery.instructions}
                onChange={(e) => updateField('delivery', 'instructions', e.target.value)}
              />
            </div>
          </div>
        </div>

        {isRap ? (
          <div className="card form-section">
            <h2>Purchase Details</h2>
            <div className="form-group">
              <label>What should the rider buy? *</label>
              <textarea
                className="form-control"
                required
                rows={4}
                placeholder="e.g. 2kg rice, 1L oil, 1 packet biscuits from the village store"
                value={formData.purchaseDetails.instructions}
                onChange={(e) => updateField('purchaseDetails', 'instructions', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Estimated Item Cost (PKR)</label>
              <input
                type="number"
                min="0"
                className="form-control"
                placeholder="Amount you expect the items to cost"
                value={formData.purchaseDetails.estimatedItemCost}
                onChange={(e) => updateField('purchaseDetails', 'estimatedItemCost', e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className="card form-section">
            <h2>Package Items</h2>
            {formData.items.map((item, index) => (
              <div className="item-row" key={index}>
                <div className="item-header">
                  <strong>Item {index + 1}</strong>
                  {formData.items.length > 1 && (
                    <button type="button" className="btn-icon" onClick={() => removeItem(index)} aria-label="Remove item">
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
                <div className="item-grid">
                  <div className="form-group full-width">
                    <label>Item Name *</label>
                    <input
                      className="form-control"
                      required
                      placeholder="e.g. Documents, Groceries"
                      value={item.name}
                      onChange={(e) => updateItem(index, 'name', e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Quantity</label>
                    <input
                      type="number"
                      min="1"
                      className="form-control"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Weight (kg)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      className="form-control"
                      value={item.weight}
                      onChange={(e) => updateItem(index, 'weight', e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Category</label>
                    <select
                      className="form-control"
                      value={item.category}
                      onChange={(e) => updateItem(index, 'category', e.target.value)}
                    >
                      {CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="checkbox-group">
                  <input
                    type="checkbox"
                    id={`fragile-${index}`}
                    checked={item.fragile}
                    onChange={(e) => updateItem(index, 'fragile', e.target.checked)}
                  />
                  <label htmlFor={`fragile-${index}`}>Fragile / handle with care</label>
                </div>
              </div>
            ))}
            <button type="button" className="btn btn-outline btn-add" onClick={addItem}>
              <Plus size={18} /> Add another item
            </button>
          </div>
        )}

        <div className="card form-section summary-section">
          <h2>Payment Method</h2>
          <div className="payment-options">
            {['cod', 'online', 'wallet'].map((method) => (
              <label key={method} className="radio-label">
                <input
                  type="radio"
                  name="paymentMethod"
                  checked={formData.paymentMethod === method}
                  onChange={() => setFormData((prev) => ({ ...prev, paymentMethod: method }))}
                />
                {method === 'cod' ? 'Cash on Delivery' : method === 'online' ? 'Online Payment' : 'Wallet'}
              </label>
            ))}
          </div>

          <div className="fee-estimate">
            <span>Estimated Total</span>
            <strong>{formatPKR(estimate)}</strong>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Final amount is confirmed after the rider accepts and the order is processed.
          </p>

          <button type="submit" className="btn btn-primary submit-btn" disabled={loading}>
            {loading ? 'Submitting...' : 'Submit Order'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateOrder;
