# Self-Signed Certificate Support

## Issue
Authentication was failing when connecting to Plan servers using self-signed SSL certificates. The Node.js `fetch()` API rejects self-signed certificates by default.

## Solution
The server now supports self-signed certificates through two mechanisms:

### 1. Environment Variable Configuration
Set one of these environment variables before running the server:

- `PLAN_REJECT_UNAUTHORIZED=false` - Disables certificate verification specifically for Plan connections
- `NODE_TLS_REJECT_UNAUTHORIZED=0` - Node.js standard environment variable to disable certificate verification globally

### 2. Implementation Details
- Added HTTPS and HTTP agents to the fetch configuration
- All API calls now use `getAgentOptions()` to provide the appropriate agent based on certificate settings
- The server intelligently routes HTTP and HTTPS requests to their respective agents

### Usage Examples

#### Option 1: Using PLAN_REJECT_UNAUTHORIZED
```bash
set PLAN_REJECT_UNAUTHORIZED=false
node src/lib/server.js --server-url https://your-plan-server --token your-token --teamspace-id your-id
```

#### Option 2: Using NODE_TLS_REJECT_UNAUTHORIZED
```bash
set NODE_TLS_REJECT_UNAUTHORIZED=0
node src/lib/server.js --server-url https://your-plan-server --token your-token --teamspace-id your-id
```

#### Option 3: Using .env file
Create a `.env` file in the project root:
```
PLAN_REJECT_UNAUTHORIZED=false
PLAN_SERVER_URL=https://your-plan-server
PLAN_ACCESS_TOKEN=your-token
PLAN_TEAMSPACE_ID=your-id
```

Then run:
```bash
node src/lib/server.js
```

## Security Considerations
⚠️ **Warning**: Disabling certificate verification makes your application vulnerable to man-in-the-middle (MITM) attacks.

This should only be used in development or trusted environments. For production:
1. Use a valid SSL certificate signed by a trusted Certificate Authority
2. Or import your self-signed certificate into Node.js's certificate store
3. Or use certificate pinning

## Files Modified
- `src/lib/server.js` - Added HTTPS/HTTP agent configuration and updated all fetch calls

## Environment Variables
- `PLAN_REJECT_UNAUTHORIZED` (boolean, default: not set) - Set to `false` to disable certificate verification for Plan
- `NODE_TLS_REJECT_UNAUTHORIZED` (boolean, default: not set) - Node.js standard, set to `0` to disable globally
