# Self-Signed SSL Certificate Fix - Summary

## Problem
The MCP DevOps Plan server was failing to authenticate when connecting to Plan servers using self-signed SSL certificates. This occurred because Node.js's `fetch()` API by default rejects unverified SSL certificates.

## Root Cause
All HTTP/HTTPS API calls in `src/lib/server.js` were using the default Node.js fetch behavior which enforces certificate validation. Self-signed certificates fail this validation check.

## Solution Implemented

### 1. **Added HTTPS/HTTP Agent Support**
   - Imported Node.js's `https` and `http` modules
   - Created configurable HTTPS and HTTP agents that can disable certificate validation

### 2. **Environment Variable Control**
   Two environment variables control certificate verification:
   - `PLAN_REJECT_UNAUTHORIZED=false` - Disables verification for Plan connections only
   - `NODE_TLS_REJECT_UNAUTHORIZED=0` - Node.js standard to disable globally

### 3. **Updated All Fetch Calls**
   - Added a `getAgentOptions()` helper function that returns the appropriate agent
   - Updated all ~50 fetch calls throughout the codebase to include `...getAgentOptions(serverURL)`
   - Agents are automatically selected based on URL protocol (HTTP vs HTTPS)

## Code Changes

### New Imports
```javascript
import https from 'https';
import { Agent as HttpAgent } from 'http';
```

### Agent Configuration
```javascript
const rejectUnauthorized = process.env.PLAN_REJECT_UNAUTHORIZED !== 'false' && 
                           process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0';

const httpsAgent = new https.Agent({
    rejectUnauthorized: rejectUnauthorized
});

const httpAgent = new HttpAgent({
    keepAlive: true
});
```

### Helper Function
```javascript
function getAgentOptions(url) {
    return {
        agent: url.startsWith('https') ? httpsAgent : httpAgent
    };
}
```

### Updated Fetch Calls
All fetch calls now follow this pattern:
```javascript
await fetch(url, {
    method: 'GET',
    headers: {...},
    ...getAgentOptions(serverURL)  // ← Added this
});
```

## Usage

### Set Environment Variable
```bash
# PowerShell
$env:PLAN_REJECT_UNAUTHORIZED = 'false'
node src/lib/server.js --server-url https://your-plan-server --token your-token --teamspace-id your-id

# Or in .env file
PLAN_REJECT_UNAUTHORIZED=false
PLAN_SERVER_URL=https://your-plan-server
PLAN_ACCESS_TOKEN=your-token
PLAN_TEAMSPACE_ID=your-id
```

## Security Notes
⚠️ **Important**: Disabling certificate verification should only be used in:
- Development environments
- Test environments with trusted servers
- Environments with self-signed certificates from known sources

**Production deployments should**:
1. Use certificates from trusted Certificate Authorities
2. Implement certificate pinning if necessary
3. Keep `PLAN_REJECT_UNAUTHORIZED` unset (default: enabled)

## Files Modified
- `src/lib/server.js` - Added agent configuration and updated all fetch calls
- `SELF_SIGNED_CERTS.md` - New documentation file with usage instructions

## Testing
The fix has been verified for:
- ✅ Syntax correctness (node -c check passes)
- ✅ All ~50 fetch calls updated with agent options
- ✅ Backward compatibility (default behavior unchanged when env vars not set)
- ✅ Environment variable reading from both CLI and .env

## Backward Compatibility
The changes are fully backward compatible:
- If `PLAN_REJECT_UNAUTHORIZED` and `NODE_TLS_REJECT_UNAUTHORIZED` are not set, certificate verification remains enabled (default secure behavior)
- Existing deployments continue to work without changes
- Only servers with self-signed certificates need to set the environment variable
