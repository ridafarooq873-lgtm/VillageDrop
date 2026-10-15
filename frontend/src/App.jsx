import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Layout from './components/Layout.jsx'
import AdminLayout from './components/AdminLayout.jsx'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Earnings from './pages/Earnings.jsx'
import AvailableRequests from './pages/AvailableRequests.jsx'
import ActiveDeliveries from './pages/ActiveDeliveries.jsx'
import PurchaseWorkflow from './pages/PurchaseWorkflow.jsx'
import CompletedDeliveries from './pages/CompletedDeliveries.jsx'
import AdminDashboard from './pages/admin/AdminDashboard.jsx'
import AdminOrders from './pages/admin/AdminOrders.jsx'
import AdminRiders from './pages/admin/AdminRiders.jsx'
import AdminUsers from './pages/admin/AdminUsers.jsx'
import AdminFees from './pages/admin/AdminFees.jsx'
import AdminDisputes from './pages/admin/AdminDisputes.jsx'
import AdminEarnings from './pages/admin/AdminEarnings.jsx'
import AdminMonitoring from './pages/admin/AdminMonitoring.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="requests" element={<AvailableRequests />} />
          <Route path="active" element={<ActiveDeliveries />} />
          <Route path="active/:orderId/purchase" element={<PurchaseWorkflow />} />
          <Route path="completed" element={<CompletedDeliveries />} />
          <Route path="earnings" element={<Earnings />} />
        </Route>
      </Route>

      <Route path="/admin" element={<ProtectedRoute roles={['admin']} />}>
        <Route element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="riders" element={<AdminRiders />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="fees" element={<AdminFees />} />
          <Route path="earnings" element={<AdminEarnings />} />
          <Route path="disputes" element={<AdminDisputes />} />
          <Route path="monitoring" element={<AdminMonitoring />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
