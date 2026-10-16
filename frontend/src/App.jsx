import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ProtectedRoute from './components/ProtectedRoute';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import CreateOrder from './pages/CreateOrder';
import OrderHistory from './pages/OrderHistory';
import OrderDetails from './pages/OrderDetails';
import RiderPortal from './pages/RiderPortal';
import AdminPortal from './pages/AdminPortal';
import { roleHomePath } from './utils/roleRoutes';
import { useAuth } from './hooks/useAuth';
import './App.css';

const RoleHome = () => {
  const { user } = useAuth();
  return <Navigate to={roleHomePath(user?.role)} replace />;
};

function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <Router>
          <div className="app-container">
            <Navbar />
            <main className="main-content">
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />

                <Route element={<ProtectedRoute roles={['customer']} />}>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/orders" element={<OrderHistory />} />
                  <Route path="/orders/new" element={<CreateOrder />} />
                  <Route path="/orders/:id" element={<OrderDetails />} />
                </Route>
                <Route element={<ProtectedRoute roles={['rider']} />}>
                  <Route path="/rider" element={<RiderPortal />} />
                </Route>
                <Route element={<ProtectedRoute roles={['admin']} />}>
                  <Route path="/admin" element={<AdminPortal />} />
                </Route>
                <Route path="*" element={<RoleHome />} />
              </Routes>
            </main>
            <Footer />
          </div>
          <Toaster position="top-right" />
        </Router>
      </SocketProvider>
    </AuthProvider>
  );
}

export default App;
