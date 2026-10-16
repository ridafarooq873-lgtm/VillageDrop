export default function OrderCard({ order, children }) {
  const addr = order.deliveryAddress || {}
  const shop = order.shop

  return (
    <article className="order-card">
      <div className="order-head">
        <div>
          <span className="order-no">{order.orderNumber}</span>
          <span className="order-shop">{shop?.name || 'VillageDrop store'}</span>
        </div>
        <span className="order-amount">Rs {order.total}</span>
      </div>

      <div className="order-route">
        <div className="route-point">
          <span className="dot dot-pickup" />
          <div>
            <span className="route-label">Pickup</span>
            <span className="route-text">{order.shopAddress?.street || shop?.address?.street || 'Shop location'}</span>
          </div>
        </div>
        <div className="route-point">
          <span className="dot dot-drop" />
          <div>
            <span className="route-label">Deliver to</span>
            <span className="route-text">
              {addr.street || addr.city || 'Customer address'}
              {addr.city ? `, ${addr.city}` : ''}
            </span>
          </div>
        </div>
      </div>

      <div className="order-meta">
        <span>Customer: {order.customer?.name || addr.name || '—'}</span>
        {order.customer?.phone && <span>· {order.customer.phone}</span>}
        <span>· Fee: Rs {order.deliveryFee}</span>
      </div>

      {children && <div className="order-actions">{children}</div>}
    </article>
  )
}
