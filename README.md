# 💧 Water Refill Station Finder & Impact Tracker

A campus sustainability web app: find nearby water refill stations, log refills,
track your environmental impact, and compete with friends — no backend required,
everything runs in the browser.

## 📁 Project Structure

```
refill-project/
├── index.html              # Main HTML page
├── css/
│   └── style.css           # All styling (responsive, dark/light mode, accessibility)
├── js/
│   └── app.js              # All application logic
├── data/
│   └── stations.json       # Starter station data (replace with real campus coordinates)
├── lib/leaflet/            # Leaflet map library (local copy - no CDN blocking)
│   ├── leaflet.min.css
│   ├── leaflet.min.js
│   └── images/
│       ├── marker-icon.png
│       ├── marker-icon-2x.png
│       ├── marker-shadow.png
│       ├── layers.png
│       └── layers-2x.png
└── README.md
```

---

## 🚀 How to Run

### Prerequisites
- **Python 3** installed (recommended) — [Download here](https://python.org/downloads)
  - ✅ Check "Add Python to PATH" during installation

### Quick Start (Windows)

1. **Open Command Prompt / PowerShell**
   - Press `Win + R`, type `cmd`, press Enter

2. **Navigate to the project folder**
   ```cmd
   cd "C:\Users\ASUS\Desktop\OWASP 12 Nov\refill-project\refill-project"
   ```

3. **Start the local server**
   ```cmd
   python -m http.server 8000
   ```
   *If `python` isn't recognized, try `py -m http.server 8000`*

4. **Open in browser**
   - Go to: **http://localhost:8000**

5. **Keep the terminal window open** while using the app

6. **To stop**: Press `Ctrl + C` in the terminal

---

### Alternative Ways to Run

| Method | Command |
|--------|---------|
| **Python (explicit)** | `py -m http.server 8000` |
| **Node.js (if installed)** | `npx http-server -p 8000` |
| **VS Code** | Install "Live Server" extension → Right-click `index.html` → "Open with Live Server" |
| **PHP (if installed)** | `php -S localhost:8000` |

---

## ⚠️ Why a Local Server is Required

| Feature | `file://` (double-click) | `http://localhost` |
|---------|--------------------------|-------------------|
| Map tiles (OpenStreetMap) | ⚠️ May work | ✅ Works |
| `stations.json` fetch | ❌ **Blocked by CORS** | ✅ Works |
| Leaflet marker images | ⚠️ May work | ✅ Works |
| localStorage | ✅ Works | ✅ Works |
| Browser privacy/Tracking Prevention | ❌ Blocks CDN | ✅ Works (local assets) |

**Always use a local server** — double-clicking `index.html` will not load station data.

---

## 🎯 Quick Test Checklist

Once open at `http://localhost:8000`, verify:

- [ ] **Finder tab**: Map loads with 4 blue markers (sample stations)
- [ ] **Finder → "Find stations near me"**: Requests GPS permission, sorts by distance
- [ ] **Search box**: Filters stations by name/building
- [ ] **Filter pills**: All / Fountain / Bottle Filler / Cooler / Favorites
- [ ] **Tracker tab**: Stats show 0, log a refill (select station, enter bottles, submit)
- [ ] **Tracker → History**: Shows logged refills
- [ ] **Tracker → Export CSV**: Downloads `refill_history_YYYY-MM-DD.csv`
- [ ] **Leaderboard tab**: Add a name + bottles, see ranking
- [ ] **Manage Stations tab**: Click map → auto-fills coordinates → add new station
- [ ] **Theme toggle** (🌙/☀️ top-right): Switches dark/light mode
- [ ] **No red errors** in DevTools Console (F12)

---

## 🔧 Configuration

### Campus Coordinates
Edit `CAMPUS_CONFIG` at the top of `js/app.js`:
```js
const CAMPUS_CONFIG = {
  name: 'My Campus',
  defaultLat: 40.7128,    // Your campus latitude
  defaultLng: -74.0060,   // Your campus longitude
  defaultZoom: 16,
  bounds: null            // Optional: [[south, west], [north, east]] to restrict map
};
```

### Environmental Constants
Also in `js/app.js` (top of file):
```js
const PLASTIC_PER_BOTTLE_G = 12.7;  // g per single-use PET bottle
const CO2_PER_BOTTLE_G = 82.8;      // g CO₂e per bottle (production + transport)
const COST_PER_BOTTLE = 1.5;        // $ cost per bottled water on campus
```

### Real Station Data
Edit `data/stations.json` with verified locations:
```json
[
  {
    "id": "s1",
    "name": "Library Main Entrance",
    "building": "Main Library",
    "lat": 40.7128,
    "lng": -74.0060,
    "type": "bottle-filler",
    "status": "ok",
    "verified": true
  }
]
```
- Get coordinates: Google Maps → right-click → "What's here?" → copy lat/lng
- `type`: `fountain`, `bottle-filler`, or `cooler`
- `verified: true` = shows green checkmark; `false` = shows warning (sample data)

---

## 🌐 Deploying to Production

This is a static site — deploy anywhere:

| Platform | Command |
|----------|---------|
| **GitHub Pages** | Push to repo → Settings → Pages → Deploy from branch |
| **Netlify** | Drag `refill-project` folder to netlify.com/drop |
| **Vercel** | `npx vercel` in project folder |
| **Any web server** | Copy all files to document root |

**No build step required.** All assets are local (including Leaflet).

---

## 🛠 Troubleshooting

| Issue | Fix |
|-------|-----|
| `python` not found | Install Python from python.org, check "Add to PATH", restart terminal |
| Map shows "Map unavailable" | You're opening via `file://` — use `http://localhost:8000` |
| No stations appear | Check Console (F12) for errors; verify `data/stations.json` is valid JSON |
| Geolocation denied | Browser blocked it → click 🔒 in address bar → allow location |
| Dark mode not saving | Clear localStorage (DevTools → Application → Clear storage) |
| Port 8000 busy | Use `python -m http.server 8001` and open `http://localhost:8001` |

---

## 📱 Features Overview

- **Finder**: Interactive map, search, filters, favorites, issue reporting, GPS distance sorting
- **Tracker**: Impact stats (bottles, plastic kg, CO₂ kg, $ saved), weekly chart, history, CSV export
- **Leaderboard**: Manual entry for teams/dorms, combined with your actual refill count
- **Manage Stations**: Add/remove stations, click map to pick coordinates, verified/sample distinction
- **Accessibility**: WCAG AA contrast, keyboard navigation, screen reader support, reduced motion
- **Responsive**: Mobile (320px+) → tablet → desktop breakpoints
- **Privacy-friendly**: No external tracking, all data in localStorage, Leaflet hosted locally

---

## 📄 License

MIT — free to use, modify, and deploy for your campus.