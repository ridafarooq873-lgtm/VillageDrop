import './StatusBadge.css';

const STATUS_LABELS = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  assigned: 'Assigned',
  purchasing: 'Purchasing',
  picked_up: 'Picked Up',
  in_transit: 'In Transit',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const StatusBadge = ({ status }) => {
  const key = (status || 'pending').toLowerCase();
  return (
    <span className={`status-badge status-${key}`}>
      {STATUS_LABELS[key] || status}
    </span>
  );
};

export default StatusBadge;
