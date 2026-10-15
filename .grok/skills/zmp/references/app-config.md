# app-config.json

Must live at the project root. Source: https://docs.zaloplatforms.com/docs/MA/devtools/app-config

## Top-level

| Property | Type | Required | Notes |
|----------|------|----------|-------|
| app | object | yes | Initial chrome (title, bars, safe areas) |
| listCSS | string[] | no | Extra CSS URLs |
| listSyncJS | string[] | no | Scripts loaded/executed in list order (sync) |
| listAsyncJS | string[] | no | Scripts loaded in parallel; run as each finishes |

## app object

| Property | Default | Notes |
|----------|---------|-------|
| title | — | **Required** app name |
| headerTitle | — | Nav bar title (string or `{ en, vi, my }`) |
| headerColor | — | Status/nav color hex, or `{ light, dark }` |
| textColor | — | `white` \| `black`, or `{ light, dark }` |
| leftButton | `back` | `none` \| `back` |
| statusBar | `normal` | `normal` \| `hidden` \| `transparent` (API 2.25.0+) |
| actionBarHidden | false | Hide default Zalo action bar to custom-draw header |
| hideAndroidBottomNavigationBar | false | |
| hideIOSSafeAreaBottom | false | |
| selfControlLoading | false | If true, call `closeLoading()` yourself |

## Minimal example

```json
{
  "app": {
    "title": "My App",
    "headerColor": "#1843EF",
    "headerTitle": "Videos",
    "textColor": "white",
    "leftButton": "back",
    "statusBar": "normal",
    "actionBarHidden": false,
    "hideAndroidBottomNavigationBar": true,
    "hideIOSSafeAreaBottom": true
  }
}
```

## Theme-aware colors

```json
{
  "app": {
    "title": "My App",
    "headerColor": { "light": "#ffffff", "dark": "#000000" },
    "textColor": { "light": "black", "dark": "white" }
  }
}
```

Older Zalo builds fall back to `light` / `vi` values.
