import { ArrowRight, MapPinned, PackageCheck, UsersRound } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import './LandingPage.css'

const roleHome = (role) => {
  if (role === 'admin') return '/admin'
  if (role === 'customer') return '/customer'
  if (role === 'rider') return '/dashboard'
  return '/login'
}

const features = [
  {
    icon: PackageCheck,
    title: 'Fast Delivery',
    description: '30 min me delivery',
  },
  {
    icon: MapPinned,
    title: 'Live Tracking',
    description: 'Socket.IO se real-time rider tracking',
  },
  {
    icon: UsersRound,
    title: 'For Everyone',
    description: 'Customer, Rider, Admin panels',
  },
]

export default function LandingPage() {
  const { token, user, loading } = useAuth()

  if (loading) return <div className="landing-loading" aria-label="Loading account" />
  if (token) return <Navigate to={roleHome(user?.role)} replace />

  return (
    <div className="landing">
      <header className="landing-header">
        <Link className="landing-brand" to="/" aria-label="Village Drop home">
          <span className="landing-brand-mark">VD</span>
          <span>Village Drop</span>
        </Link>
        <nav className="landing-nav" aria-label="Main navigation">
          <Link className="landing-login" to="/login">Login</Link>
          <Link className="landing-register" to="/register">Register</Link>
        </nav>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <span className="landing-eyebrow">YOUR VILLAGE, A LITTLE CLOSER</span>
            <h1>Gaon Se Sheher Tak,<br /><span>Delivery Ab Asaan</span></h1>
            <p>Village Drop - Fast, Reliable Delivery for Your Village</p>
            <div className="landing-actions">
              <Link className="landing-button landing-button-primary" to="/register">
                Order Now <ArrowRight size={18} />
              </Link>
              <Link className="landing-button landing-button-secondary" to="/register?role=rider">
                Become a Rider
              </Link>
            </div>
            <div className="landing-trust">
              <span className="landing-trust-dot" />
              Connecting local communities, one delivery at a time
            </div>
          </div>

          <div className="landing-illustration" aria-label="Delivery rider illustration" role="img">
            <div className="landing-sun" />
            <div className="landing-orbit landing-orbit-one" />
            <div className="landing-orbit landing-orbit-two" />
            <span className="landing-spark landing-spark-one">✦</span>
            <span className="landing-spark landing-spark-two">✦</span>
            <div className="landing-delivery-card">
              <span className="landing-scooter" aria-hidden="true">🛵</span>
              <div className="landing-delivery-label">
                <strong>On the way!</strong>
                <span>Your village delivery</span>
              </div>
              <span className="landing-delivery-check">✓</span>
            </div>
            <span className="landing-package" aria-hidden="true">📦</span>
            <span className="landing-leaf landing-leaf-left" aria-hidden="true">🌿</span>
            <span className="landing-leaf landing-leaf-right" aria-hidden="true">🌱</span>
            <div className="landing-ground" />
          </div>
        </section>

        <section className="landing-features">
          <div className="landing-section-heading">
            <span className="landing-eyebrow">MADE FOR YOUR COMMUNITY</span>
            <h2>Delivery that brings us closer</h2>
          </div>
          <div className="landing-feature-grid">
            {features.map(({ icon: Icon, title, description }, index) => (
              <article className="landing-feature-card" key={title}>
                <span className={`landing-feature-icon landing-feature-icon-${index + 1}`}>
                  <Icon size={24} strokeWidth={2} />
                </span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-how">
          <div className="landing-section-heading">
            <span className="landing-eyebrow">SIMPLE AS 1, 2, 3</span>
            <h2>How It Works</h2>
          </div>
          <div className="landing-steps">
            {['Register', 'Place Order', 'Track & Receive'].map((step, index) => (
              <div className="landing-step" key={step}>
                <span className="landing-step-number">0{index + 1}</span>
                <span className="landing-step-line" aria-hidden="true" />
                <h3>{step}</h3>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <Link className="landing-brand" to="/">
          <span className="landing-brand-mark">VD</span>
          <span>Village Drop</span>
        </Link>
        <p>© 2026 Village Drop - FYP Project</p>
      </footer>
    </div>
  )
}
