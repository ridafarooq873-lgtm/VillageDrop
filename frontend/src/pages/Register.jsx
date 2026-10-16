import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';
import './Register.css';

const Register = () => {
  const [formData, setFormData] = useState({
    name: '', email: '', phone: '', password: '', confirmPassword: '',
    street: '', city: '', village: '', state: '', pincode: '',
    role: 'customer', vehicleType: 'motorcycle', vehicleNumber: '', licenseNumber: ''
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

      const user = await register({
        ...payload,
        role: formData.role,
        ...(formData.role === 'rider' ? {
          vehicleType: formData.vehicleType,
          vehicleNumber: formData.vehicleNumber,
          licenseNumber: formData.licenseNumber
        } : {})
      });
      if (user.role === 'rider') {
        toast.success('Application submitted. You can sign in while it awaits admin approval.');
        navigate('/rider');
      } else {
        toast.success('Registration successful!');
        navigate('/dashboard');
      }
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
        <p className="auth-subtitle">Create a customer account or apply to deliver as a rider</p>
        
        <form onSubmit={handleSubmit} className="register-form">
          <div className="form-section">
            <h3>Account Type</h3>
            <div className="form-group">
              <label htmlFor="account-role">I want to</label>
              <select
                id="account-role"
                name="role"
                className="form-control"
                value={formData.role}
                onChange={handleChange}
              >
                <option value="customer">Send and track deliveries</option>
                <option value="rider">Apply to deliver as a rider</option>
              </select>
            </div>
          </div>

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

          {formData.role === 'rider' && (
            <div className="form-section">
              <h3>Rider Application</h3>
              <p>Your account will be reviewed by an administrator before you can accept orders.</p>
              <div className="form-group">
                <label htmlFor="vehicleType">Vehicle type</label>
                <select
                  id="vehicleType"
                  name="vehicleType"
                  className="form-control"
                  value={formData.vehicleType}
                  onChange={handleChange}
                >
                  <option value="bicycle">Bicycle</option>
                  <option value="motorcycle">Motorcycle</option>
                  <option value="auto">Auto</option>
                  <option value="van">Van</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="vehicleNumber">Vehicle number</label>
                <input id="vehicleNumber" name="vehicleNumber" className="form-control" required value={formData.vehicleNumber} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label htmlFor="licenseNumber">License number</label>
                <input id="licenseNumber" name="licenseNumber" className="form-control" required value={formData.licenseNumber} onChange={handleChange} />
              </div>
            </div>
          )}

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
