# Deep Link Debugging Guide

## Quick Debug Command

After the app loads, you can run this in the console to check deep link status:
```javascript
window.debugDeepLink()
```

## What to Check During Login Flow

### 1. When Login Button is Clicked
Look for these logs:
- `🔵🔵🔵 window.open called 🔵🔵🔵` - Confirms window.open override is working
- `🔍 Original redirect_uri from URL:` - Shows what SessionConnector sent
- `🔍 Final redirect_uri after processing:` - Should be `lootsurvivor://open`
- `🔍 Final redirect_query_name:` - Should be `startapp`

### 2. When Browser Opens
Look for:
- `✅ Browser.open succeeded - browser should be opening`
- `🔍🔍🔍 CRITICAL: Redirect URI Check 🔍🔍🔍`
- `✅ Redirect URI is correct!` - This confirms the URL is correct
- Check the full URL parameters logged

### 3. In the Browser
- Does the Cartridge authentication page load?
- Does the user complete authentication?
- After authentication, does the page redirect or just close?
- Is there any error message?

### 4. When Browser Closes
Look for:
- `🔍 Browser finished/closed event received`
- Multiple `🔍 Checking for launch URL (attempt X/10)...`
- `✅ Found launch URL` - This means the deep link arrived
- `🔗🔗🔗 appUrlOpen event fired` - This is the main event that should fire

### 5. If Deep Link Arrives
Look for:
- `✅✅✅ Processing deep link from appUrlOpen...`
- `✅ Updated window.location with startapp parameter`
- `✅ Dispatched deepLinkProcessed event`
- `✅ Session retrieved successfully!`
- `✅ Connect hook promise resolved`

## Common Issues

### Issue: `getLaunchUrl()` returns `undefined`
**Possible causes:**
- The redirect from Cartridge isn't happening
- iOS isn't capturing the deep link
- The redirect_uri format is wrong

**Check:**
- Is redirect_uri exactly `lootsurvivor://open`?
- Is redirect_query_name set to `startapp`?
- Does the user complete authentication?

### Issue: `appUrlOpen` event never fires
**Possible causes:**
- Deep link isn't arriving
- Event listener isn't set up correctly
- iOS isn't handling the custom URL scheme

**Check:**
- Is the URL scheme `lootsurvivor` registered in Info.plist? (It should be)
- Try calling `window.debugDeepLink()` to see current state

### Issue: Session retrieved but account not connected
**Possible causes:**
- Session registration transaction failed
- React state not updating
- Backend registration failed

**Check:**
- Look for transaction errors in logs
- Check if `connect()` hook promise resolves
- Verify account is available after connect

## Expected Flow

1. User clicks "Log In"
2. `window.open()` is called with Cartridge auth URL
3. Browser opens with authentication page
4. User authenticates
5. Cartridge redirects to `lootsurvivor://open?startapp=<token>`
6. iOS captures the deep link
7. `appUrlOpen` event fires
8. `handleDeepLink()` processes the URL
9. `window.location` is updated with `startapp` parameter
10. SessionConnector retrieves session
11. `connect()` hook registers session with backend
12. Account becomes available
13. Loading state clears

## Debug Commands

```javascript
// Check current deep link status
window.debugDeepLink()

// Check window.location
console.log(window.location.href)
console.log(window.location.search)

// Check SessionConnector
console.log(window.starknet_controller_session)

// Check localStorage for session
Object.keys(localStorage).filter(k => k.includes('session') || k.includes('controller'))
```
