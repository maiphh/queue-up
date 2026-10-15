# Permissions and client APIs

Sources:
- https://docs.zaloplatforms.com/docs/MA/intro/request-permission
- https://docs.zaloplatforms.com/docs/MA/api/intro
- https://docs.zaloplatforms.com/docs/MA/intro/best-practices/authen-user

Install: `npm install zmp-sdk` — UI: `npm install zmp-ui`

Admin of the Mini App can use restricted APIs during development without waiting for permission approval. End users need approved permissions.

## Permission groups

1. **User Device** — location, camera, vibrate, keep screen, native storage, save image, …
2. **User Information** — phone number (time-limited; user can remember choice)
3. **Zalo** — share, QR scan, OA follow, profile picker, chat, …
4. **Mini App** — nav bar color/title, open/close Mini App

Request Zalo-side permissions in Mini App Center → Mini App Permissions (reason + screenshots). Reviewed with version review.

## Request user permission in context

- Ask only when the feature needs it (e.g. phone at checkout, not on first paint)
- If phone is mandatory for the whole app, show onboarding that explains why
- Handle deny paths (`AppError` codes, e.g. getUserInfo name/avatar deny `-1401`)

## Auth

```ts
import { getAccessToken, getUserInfo, getPhoneNumber, getUserID } from "zmp-sdk";

const token = await getAccessToken();
// send token to YOUR backend; backend calls graph.zalo.me with appsecret_proof

const { userInfo } = await getUserInfo({ autoRequestPermission: true });
const idOnly = await getUserID(); // no consent UI
```

Backend profile fetch:

- `GET https://graph.zalo.me/v2.0/me?fields=id,name,birthday,picture`
- Headers: `access_token`, `appsecret_proof` = HMAC-SHA256(access_token, ZALO_APP_SECRET)

## API map (client)

| Area | Key APIs |
|------|----------|
| Events | `events.on/once/off`, `AppPaused`, `AppResumed`, `NetworkChanged`, `OnDataCallback`, `OpenApp`, `PaymentDone` |
| User | `authorize`, `getUserID`, `getUserInfo`, `getAccessToken`, `getPhoneNumber`, `getSetting` |
| Basic | `getAppInfo`, `getSystemInfo`, `getDeviceIdAsync`, `getContextAsync` |
| Routing | `closeApp`, `openMiniApp`, `openWebview`, `sendDataToPreviousMiniApp`, `getRouteParams` |
| Storage | `setItem` / `getItem` / `removeItem` / `clear` / `getStorageInfo` (5MB; LRU eviction) |
| LFS | `isSupportLFS`, `saveFile`, `getFileInfo`, `getSavedFileList`, `removeSavedFile` |
| UI | `showToast`, `closeLoading`, `configAppView`, `setNavigationBar*`, `hideKeyboard` |
| Location | `getLocation` |
| Media | `createCameraContext`, `chooseImage`, `openMediaPicker`, `downloadFile`, `openDocument`, save to gallery |
| Device | `getNetworkType`, `openPhone`, `openSMS`, `keepScreen`, `vibrate`, bio auth |
| Permission | `requestSendNotification`, `openPermissionSetting` |
| Zalo social | `openShareSheet`, `openPostFeed`, `followOA`, `unfollowOA`, `openChat`, `openProfile`, `openProfilePicker`, `viewOAQr`, `createShortcut`, `favoriteApp`, `addRating`, `minimizeApp` |
| Widgets | `showOAWidget`, `showFunctionButtonWidget` |
| Ads | `setupAd`, `loadAd`, `displayAd`, `refreshAd` |

Errors: https://docs.zaloplatforms.com/docs/MA/api/errorCode

## ZaUI skeleton

```tsx
import { App, ZMPRouter, AnimationRoutes, Route, Page, Box, Text, Button } from "zmp-ui";
import { showToast } from "zmp-sdk";

export default function MyApp() {
  return (
    <App>
      <ZMPRouter>
        <AnimationRoutes>
          <Route path="/" element={<HomePage />} />
        </AnimationRoutes>
      </ZMPRouter>
    </App>
  );
}

function HomePage() {
  return (
    <Page>
      <Box p={4}>
        <Text>Hello Zalo Mini App</Text>
        <Button onClick={() => showToast({ message: "Hi!" })}>Start</Button>
      </Box>
    </Page>
  );
}
```

ZaUI docs: https://docs.zaloplatforms.com/docs/MA/zaui/overview/intro
