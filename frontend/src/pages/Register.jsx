import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';
import './Register.css';

const Register = () => {
  const [formData, setFormData] = useState({
    name: '', email: '', phone: '', password: '', confirmPassword: '',
    street: '', city: '', village: '', state: '', pincode: ''
  });
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      return toast.error('Passwords do not match');
    }

    setLoading(true);
    try {
      const address = {
        street: formData.street,
        city: formData.city,
        village: formData.village,
        state: formData.state,
        pincode: formData.pincode
      };
      
      const payload = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        password: formData.password,
        address
      };

      await register(payload);
      toast.success('Registration successful!');
      navigate('/dashboard');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card register-card">
        <h2 className="auth-title">Join Village Drop</h2>
        <p className="auth-subtitle">Create your account to start shipping</p>
        
        <form onSubmit={handleSubmit} className="register-form">
          <div className="form-section">
            <h3>Personal Info</h3>
            <div className="form-group">
              <label>Full Name</label>
              <input type="text" name="name" className="form-control" required onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input type="email" name="email" className="form-control" required onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Phone</label>
              <input type="text" name="phone" className="form-control" required onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input type="password" name="password" className="form-control" required onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Confirm Password</label>
              <input type="password" name="confirmPassword" className="form-control" required onChange={handleChange} />
            </div>
          </div>

          <div className="form-section">
            <h3>Address Details</h3>
            <div className="form-group">
              <label>Street/House No</label>
              <input type="text" name="street" className="form-control" required onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Village/Locality</label>
              <input type="text" name="village" className="form-control" required onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>City/Town</label>
              <input type="text" name="city" className="form-control" required onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>State</label>
              <input type="text" name="state" className="form-control" required onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Pincode</label>
              <input type="text" name="pincode" className="form-control" required onChange={handleChange} />
            </div>
          </div>
          
          <div className="form-actions">
            <button type="submit" className="btn btn-primary auth-btn" disabled={loading}>
              {loading ? 'Registering...' : 'Register Account'}
            </button>
            <p className="auth-redirect">
              Already have an account? <Link to="/login">Login here</Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Register;
