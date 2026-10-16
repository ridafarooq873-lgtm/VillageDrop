import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';
import { getNotifications, markNotificationRead as markReadApi } from '../api/customerApi';

const SocketContext = createContext(null);

export const useSocket = () => useContext(SocketContext);

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

const normalizeNotification = (n) => ({
  id: n.id || n._id,
  userId: n.userId || n.user,
  orderId: n.orderId || n.relatedId || null,
  title: n.title,
  message: n.message,
  type: n.type,
  read: n.read ?? n.isRead ?? false,
  createdAt: n.createdAt || new Date().toISOString(),
});

export const SocketProvider = ({ children }) => {
  const { token, user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [notifications, setNotifications] = useState([]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  // Connect / reconnect whenever the auth token changes
  useEffect(() => {
    if (!token) {
      setSocket(null);
      setConnected(false);
      setNotifications([]);
      return undefined;
    }

    const s = io(`${SOCKET_URL}/tracking`, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));

    // Live notification push from the server
    s.on('newNotification', (payload) => {
      const n = normalizeNotification(payload);
      setNotifications((prev) => [n, ...prev].slice(0, 50));
      toast(n.message || n.title || 'New notification');
    });

    setSocket(s);

    return () => {
      s.off('newNotification');
      s.disconnect();
    };
  }, [token]);

  // Load notification history on mount (customer REST endpoint)
  useEffect(() => {
    if (!token || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await getNotifications();
        if (!cancelled) {
          setNotifications((data.data || []).map(normalizeNotification));
        }
      } catch {
        // Non-critical; ignore history load failures
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, user]);

  const markRead = useCallback(async (id) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    try {
      await markReadApi(id);
    } catch {
      // Endpoint is customer-only; ignore failures for other roles
    }
  }, []);

  const refreshNotifications = useCallback(async () => {
    try {
      const { data } = await getNotifications();
      setNotifications((data.data || []).map(normalizeNotification));
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo(
    () => ({
      socket,
      connected,
      notifications,
      unreadCount,
      markRead,
      refreshNotifications,
    }),
    [socket, connected, notifications, unreadCount, markRead, refreshNotifications]
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};

export default SocketContext;
