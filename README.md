# Village Drop

Village-level delivery logistics platform. Customers place pickup & delivery or
rider-assisted purchase orders, riders claim and fulfil them, and admins oversee
the pipeline. Order progress and notifications are pushed to clients in real time
over Socket.IO.

- **Backend** — Node.js, Express, Mongoose, Socket.IO, JWT auth (`backend/`)
- **Frontend** — React 19, Vite, React Router 7, Axios, Socket.IO client (`frontend/`)

---

## Prerequisites

- Node.js 18+ (tested on Node 24)
- npm

MongoDB must be running locally or provided through `MONGODB_URI`; this branch
does not start an embedded database.

---

## Setup

Install dependencies for both apps:

```powershell
npm install --prefix backend
npm install --prefix frontend
```

### Environment variables

`backend/.env` (gitignored — never commit it):

| Variable | Description | Default |
|---|---|---|
| `PORT` | HTTP/socket port | `5000` |
| `NODE_ENV` | `development` enables request logging | `development` |
| `JWT_SECRET` | Signing key for access tokens | — (required) |
| `JWT_EXPIRES_IN` | Access token lifetime | `7d` |
| `MONGODB_URI` | MongoDB connection URI | Set in `backend/.env` |
| `ADMIN_BOOTSTRAP_KEY` | One-time key used to create the first admin account (minimum 32 characters) | — |

Refresh tokens are generated as random opaque values, stored hashed in MongoDB,
and rotated on use.

`frontend/.env`:

| Variable | Description | Default |
|---|---|---|
| `VITE_API_URL` | REST base URL; use `/api` locally to use the Vite proxy, or an absolute API URL in production | `/api` |

Socket.IO uses the API URL's origin. With `/api` in local development it uses
the current frontend origin and Vite proxies the socket connection to the
backend, avoiding localhost-versus-127.0.0.1 CORS mismatches.

---

## Running

Start the backend (ensure MongoDB is running):

```powershell
npm run dev:backend            # from the repository root
# or
npm run dev --prefix backend   # Node watch mode
# or
npm start --prefix backend
```

Start the frontend:

```powershell
npm run dev                # from the repository root
# or
npm run dev --prefix frontend  # http://localhost:5173
```

Production build / lint:

```powershell
npm run build
npm run lint
# or
npm run build --prefix frontend
npm run lint  --prefix frontend
```

### First admin account

Set a long, random `ADMIN_BOOTSTRAP_KEY` in `backend/.env` before starting the
backend. Create the first admin once by calling `POST /api/auth/bootstrap-admin`
with that value in the `x-admin-bootstrap-key` header and a JSON body containing
`name`, `email`, `phone`, and a password of at least 12 characters. The endpoint
is disabled until the key is configured and refuses to create another admin
after one exists. Remove `ADMIN_BOOTSTRAP_KEY` from the environment after setup.
Never use the public registration form to create an administrator.

---

## Architecture

```
backend/
  server.js                     # express + http + socket bootstrap
  config/db.js                  # Mongoose connection to configured MongoDB
  config/socket.js              # Socket.IO init + getIO()
  middleware/auth.js            # protect: verify Bearer JWT -> req.user
  middleware/rbac.js            # authorize(...roles)
  models/                       # User, Order, OrderItem, Rider, Notification, ...
  routes/
    authRoutes.js               # register / login / refresh / logout / me
    customerRoutes.js           # plural customer API
    customerCompatRoutes.js     # full customer order portal API
    riderRoutes.js              # rider onboarding, availability, queue, status updates
    adminRoutes.js              # rider approvals, order oversight
  services/orderStatusService.js# status transitions, events, notifications
  sockets/orderTracking.js      # legacy order-tracking handlers

frontend/src/
  api/client.js                 # shared axios instance + refresh-token rotation
  api/customerApi.js            # customer REST helpers
  context/AuthContext.jsx       # session, login/register/logout
  context/SocketContext.jsx     # socket connection + live notifications
  components/                   # Navbar (notification bell), ProtectedRoute, ...
  pages/                        # Customer, rider, and admin portals
```

---

## Authentication & roles

Roles: `customer`, `rider`, `admin`, and `shop` (default `customer`).

- `POST /api/auth/register/customer` creates a customer. `POST
  /api/auth/register/rider` submits a rider application. Neither endpoint can
  grant the `admin` role. Rider accounts remain unavailable until approval.
- `POST /api/auth/bootstrap-admin` → one-time first-admin setup; requires the
  `x-admin-bootstrap-key` header and a 12+ character password
- `POST /api/auth/login`
- `POST /api/auth/refresh-token` rotates the one-time refresh token
- `POST /api/auth/logout` revokes the presented refresh token
- `GET /api/auth/me`

Every protected route runs `protect` (verifies the JWT and reloads the user from
the DB, so role changes take effect immediately) followed by a role guard:

| Router | Guard |
|---|---|
| `/api/customer/*` | `authorize('customer')` |
| `/api/riders/*` | `authorize('rider')` |
| `/api/admin/*` | `authorize('admin')` |

The frontend routes each role to its own portal: customers use `/customer`,
riders use `/`, and administrators use `/admin`. Customers can create standard
or assisted-purchase requests, manage eligible cancellations, and track orders.
Riders can go online,
accept open orders, advance assigned deliveries, and confirm delivery with the
customer's PIN. Admins can review/reject rider applications and monitor orders.
Refresh tokens are rotated automatically when an API request receives an
expired-access-token response.

The customer portal uses compatibility endpoints under `/api/customer/*`;
the Iqra platform's customer API remains available at `/api/customers/*`.
Rider workflows are under `/api/riders/*`, and operations tools are under
`/api/admin/*`.

---

## Order lifecycle

The stored lifecycle uses `pending → accepted_by_shop/ready_for_pickup →
assigned_to_rider → picked_up → out_for_delivery → delivered`, plus `cancelled`
from early states. The customer API presents customer-facing status labels.

The rider API enforces valid transitions and requires the customer's 4-digit
delivery PIN to complete delivery. PINs are excluded from general/admin/rider
order queries and returned only to the owning customer on their order detail.

Key endpoints:

- `POST /api/customer/orders` — create a customer order
- `GET  /api/customer/orders/:id` — order detail
- `PUT  /api/customer/orders/:id/cancel`
- `GET  /api/riders/available-requests` — available orders
- `POST /api/riders/me/accept-request/:orderId` — claim a pending order
- `PUT  /api/riders/me/order/:orderId/status` — advance an assigned order

---

## Real-time flow (Socket.IO)

The client connects to Socket.IO's default namespace with the JWT:

```js
io({ auth: { token } })
```

Order and rider room joins are authenticated and checked against the current
user's order assignment/ownership.

**Client → server**

| Event | Payload | Purpose |
|---|---|---|
| `join:order` | `orderId` | subscribe to an owned or assigned order |
| `leave:order` | `orderId` | unsubscribe |
| `join:rider` | `riderId` | subscribe to own rider account |
| `join:admins` | — | subscribe to admin event feed |

**Server → client**

| Event | Room | Payload |
|---|---|---|
| `order:update` | authorized order room and admin feed | `{ orderId, status }` |
| `delivery:update` | rider room and admin feed | `{ riderId, orderId, status }` |
| `approval:update` | rider room and admin feed | approval changes |
| `availability:update` | rider room and admin feed | availability changes |

Authenticated sockets auto-join their private user room; the frontend joins an
order room on the customer order detail page. The server validates user status
and role on connection and verifies ownership before joining protected rooms.

---

## Testing

There is no automated end-to-end test runner configured yet. The following
checks were exercised against a local backend and browser:

- Register/login as customer and rider; verify role-specific routing.
- Confirm public admin registration is rejected and bootstrap cannot be reused.
- Submit a rider application; confirm an unapproved rider cannot accept work.
- Approve/reject applications in the admin portal; verify the rider sees the
  resulting state and rejection reason.
- Create an order, accept it as an online rider, advance delivery statuses,
  reject an incorrect delivery PIN, and complete with the customer's PIN.
- Verify role-protected APIs, rider notification history, delivery PIN privacy,
  and automatic refresh-token rotation.

Run the available project checks from the repository root:

```powershell
npm run build
npm run lint
```

Backend JavaScript syntax can be checked with `node --check` on files in
`backend/`.

---

## Troubleshooting

**MongoDB connection fails**
Ensure `MONGODB_URI` in `backend/.env` is correct and the Atlas network access
list allows your current IP address.

**`JWT_SECRET` is not configured**
Set a long, random `JWT_SECRET` in `backend/.env` before starting the backend.

**CORS / connection refused from the frontend**
Ensure the backend is on port `5000` and that `VITE_API_URL` / `VITE_SOCKET_URL`
match. Backend CORS is pinned to `http://localhost:5173`.

---

## Known issues / follow-ups

- Online payments, maps, and geocoding are not integrated; delivery distance and
  fees remain estimates.
- Rider approval currently verifies submitted information through an admin
  review; automated identity/license verification is not integrated.
- Configure production secrets, MongoDB, CORS origins, HTTPS, and rate limiting
  before exposing the service publicly.
