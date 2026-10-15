const LABELS = {
  pending: 'Pending',
  accepted_by_shop: 'Shop accepted',
  ready_for_pickup: 'Ready for pickup',
  assigned_to_rider: 'Assigned',
  picked_up: 'Picked up',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
}

export default function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{LABELS[status] || status}</span>
}
