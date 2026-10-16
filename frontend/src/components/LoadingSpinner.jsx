import './LoadingSpinner.css';

const LoadingSpinner = ({ label = 'Loading...' }) => (
  <div className="loading-spinner">
    <div className="spinner" />
    {label && <p>{label}</p>}
  </div>
);

export default LoadingSpinner;
