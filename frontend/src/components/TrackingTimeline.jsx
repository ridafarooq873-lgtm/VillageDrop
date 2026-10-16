import { CheckCircle, Clock } from 'lucide-react';
import './TrackingTimeline.css';

const formatStatus = (status = '') =>
  status
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const TrackingTimeline = ({ updates = [] }) => {
  if (!updates.length) {
    return (
      <section className="card">
        <h2><Clock size={20} /> Tracking</h2>
        <p className="timeline-empty">No tracking updates yet.</p>
      </section>
    );
  }

  return (
    <section className="card">
      <h2><Clock size={20} /> Tracking</h2>
      <ul className="tracking-timeline">
        {updates.map((update, index) => (
          <li key={index} className="timeline-item">
            <span className="timeline-marker">
              <CheckCircle size={16} />
            </span>
            <div className="timeline-content">
              <strong>{formatStatus(update.status)}</strong>
              {update.note && <p>{update.note}</p>}
              {update.location && <p className="timeline-location">{update.location}</p>}
              {update.timestamp && (
                <span className="timeline-time">
                  {new Date(update.timestamp).toLocaleString('en-PK')}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default TrackingTimeline;
