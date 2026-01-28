# iOS Build and Launch Instructions

## Prerequisites
- Xcode installed (latest version recommended)
- iOS device or Simulator
- pnpm installed (`npm install -g pnpm` if needed)

## Step-by-Step Instructions

### 1. Navigate to Client Directory
```bash
cd client
```

### 2. Install Dependencies (if needed)
```bash
pnpm install
```

### 3. Build the Web App
```bash
pnpm build
```
This will:
- Run TypeScript compilation (`tsc -b`)
- Build the production bundle with Vite
- Output files to `client/dist/`

### 4. Sync with Capacitor
```bash
pnpm cap:sync
```
Or specifically for iOS:
```bash
npx cap sync ios
```
This copies the built web assets to the iOS native project.

### 5. Open in Xcode
```bash
pnpm cap:open:ios
```
Or:
```bash
npx cap open ios
```
This opens the Xcode project at `client/ios/App/App.xcworkspace`

### 6. In Xcode

#### Select Your Target:
- **For Simulator**: Choose an iOS Simulator (e.g., "iPhone 15 Pro")
- **For Physical Device**: 
  - Connect your iPhone via USB
  - Select your device from the device list
  - You may need to sign the app with your Apple Developer account

#### Build and Run:
- Click the **Play** button (▶️) in the top-left, or
- Press `Cmd + R`
- Wait for the build to complete and the app to launch

## Quick Command (All-in-One)

For a faster workflow, you can run:
```bash
cd client && pnpm build && pnpm cap:sync && pnpm cap:open:ios
```

Then in Xcode, just click Play (▶️).

## Troubleshooting

### Build Errors
- **TypeScript errors**: Run `pnpm lint` to check for issues
- **Capacitor sync errors**: Try `npx cap sync ios --force`

### Xcode Issues
- **Signing errors**: Go to Signing & Capabilities in Xcode and select your team
- **Missing dependencies**: Run `pod install` in `client/ios/App/` directory
- **Scheme not found**: Make sure you're opening `App.xcworkspace`, not `App.xcodeproj`

### Deep Link Not Working
- Verify `Info.plist` has the `lootsurvivor` URL scheme
- Check that the app is properly signed
- Ensure you're testing on a device or simulator (not just web)

## Verification Checklist

After building, verify:
- ✅ App launches without errors
- ✅ Console shows "Platform detected: ios"
- ✅ Console shows "🔗 SessionConnector configuration" with correct values
- ✅ Login button opens browser
- ✅ Deep link is captured when returning from browser

## Debug Commands

Once the app is running, you can use these in the browser console:
```javascript
// Check deep link status
window.debugDeepLink()

// Check current URL
console.log(window.location.href)
```
