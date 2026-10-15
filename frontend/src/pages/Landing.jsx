import { Link } from 'react-router-dom';
import { Truck, Shield, Clock, IndianRupee } from 'lucide-react';
import './Landing.css';

const Landing = () => {
  return (
    <div className="landing-page">
      <section className="hero-section">
        <div className="hero-content">
          <h1 className="hero-title">Village Drop &mdash; Delivering to Every Doorstep</h1>
          <p className="hero-subtitle">
            Reliable, fast, and affordable delivery services right to your village.
            Bridging the gap between cities and rural communities.
          </p>
          <div className="hero-actions">
            <Link to="/register" className="btn btn-primary btn-large">Get Started</Link>
            <Link to="/login" className="btn btn-outline btn-large">Login</Link>
          </div>
        </div>
      </section>

      <section className="features-section">
        <h2 className="section-title">Why Choose Village Drop?</h2>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon"><Truck size={40} /></div>
            <h3>Fast Delivery</h3>
            <p>Optimized routes to ensure your packages arrive on time, every time.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><Shield size={40} /></div>
            <h3>Secure Packages</h3>
            <p>Your items are handled with utmost care and insured against damage.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><Clock size={40} /></div>
            <h3>Real-time Tracking</h3>
            <p>Know exactly where your delivery is from pickup to drop-off.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><IndianRupee size={40} /></div>
            <h3>Affordable Rates</h3>
            <p>Transparent pricing tailored for rural deliveries without hidden fees.</p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Landing;
