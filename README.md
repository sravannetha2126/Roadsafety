\# DriveLegal

**A location aware traffic regulation platform with an integrated Challan Calculator, Cross-Border Route Advisor, and Digital Document Compliance Locker.**

DriveLegal bridges the gap between complex, scattered traffic legislations and the everyday commuter. It provides a centralized dashboard that integrates national-level traffic frameworks with state and municipal-level amendments, delivering personalized, location-specific guidance on traffic laws, penalties, and compliance requirements.

---

## Table of Contents

- [Key Features](#key-features)
- [Problem Statement](#problem-statement)
- [Architecture Overview](#architecture-overview)
- [Technology Stack](#technology-stack)
- [Installation & Setup](#installation--setup)
- [Usage Guide](#usage-guide)
- [API Reference](#api-reference)
- [Offline Functionality](#offline-functionality)
- [Project Structure](#project-structure)
- [Roadmap & Future Scope](#roadmap--future-scope)
- [Contributing](#contributing)
- [License](#license)

---

## Key Features

### 1. Geo-Fenced Location-Based Rule Lookup
- Select your country and state/region to instantly view applicable traffic laws
- View region-specific speed limits (Highway, Urban, Residential)
- Read local enforcement notes and special regulation alerts
- GPS Position Simulator for testing location-based rule transitions

### 2. Automated Challan (Fine) Calculator
- Select traffic violations from a comprehensive checklist
- Dynamically calculates the total fine based on your selected region's official fine schedule
- Vehicle-type aware: switches between Helmet (2-wheelers) and Seatbelt (4-wheelers) violations automatically
- Generates a detailed receipt-style breakdown of all penalties

### 3. Digital Document Compliance Locker
- Store your Driving License, Vehicle Insurance, and Emissions (PUC) certificate expiry dates locally
- Real-time validation: Instantly shows whether each document is Valid, Expiring Soon, or Expired
- Automatic penalty integration: Expired documents are automatically added to challan calculations based on local fine rates
- Data persisted securely in browser localStorage—never leaves your device

### 4. Cross-Border Route Rule Advisor
- Compare traffic regulations between any two regions (origin and destination)
- Highlights differences in speed limits and warns about lower limits at the destination
- Compares fine structures side-by-side with currency-aware formatting
- Essential for long-distance interstate or international travel planning

### 5. Offline-First Architecture
- Full Service Worker implementation for asset caching and API response caching
- localStorage-based database synchronization ensures the app works without any network connectivity
- Automatic re-sync when the device comes back online
- Network status indicator in the header for real-time connectivity feedback

---

## Problem Statement

Citizens across the world lack easy access to clear, location-specific information about traffic laws, penalties, and enforcement procedures. While national frameworks set overarching standards, the actual implementation of rules, fine structures, and enforcement practices varies significantly across states, provinces, and municipalities. This creates confusion for citizens who may not be aware of the exact rules applicable at their location.

**DriveLegal** addresses this by:
- Consolidating national and local traffic laws into a unified, queryable database
- Providing an intuitive calculator that computes exact fines based on real regulatory data
- Offering cross-border comparisons so travelers can anticipate rule changes
- Working fully offline so users in low-network areas still have access

---

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│              Frontend (HTML/CSS/JS)          │
│                                             │
│  ┌──────────┐ ┌───────────┐ ┌────────────┐ │
│  │ Location  │ │ Calculator│ │   Route    │ │
│  │ Selector  │ │  Engine   │ │  Advisor   │ │
│  └────┬─────┘ └─────┬─────┘ └─────┬──────┘ │
│       │              │             │        │
│  ┌────▼──────────────▼─────────────▼──────┐ │
│  │        Local State Manager             │ │
│  │   (localStorage + Service Worker)      │ │
│  └────────────────┬───────────────────────┘ │
│                   │                         │
└───────────────────┼─────────────────────────┘
                    │ HTTP (when online)
┌───────────────────▼─────────────────────────┐
│           FastAPI Backend (Python)           │
│                                             │
│  ┌──────────┐ ┌───────────┐ ┌────────────┐ │
│  │ /api/    │ │ /api/     │ │ /api/route │ │
│  │  rules   │ │ calculate │ │  -compare  │ │
│  └────┬─────┘ └─────┬─────┘ └─────┬──────┘ │
│       │              │             │        │
│  ┌────▼──────────────▼─────────────▼──────┐ │
│  │      Traffic Rules JSON Database       │ │
│  │      (data/traffic_rules.json)         │ │
│  └────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Backend | Python 3.10+, FastAPI | REST API server, data processing |
| Frontend | HTML5, Vanilla CSS3, Vanilla JS | Dashboard UI, client-side logic |
| Database | JSON flat-file | Traffic rules storage (no external DB needed) |
| Offline | Service Workers, localStorage | Offline caching and data persistence |
| Fonts | Google Fonts (Outfit) | Modern typography |
| Icons | Font Awesome 6 | UI iconography |
| Styling | Custom Glassmorphism CSS | Premium dark-themed UI |

---

## Installation & Setup

### Prerequisites
- Python 3.10 or higher
- pip (Python package manager)
- A modern web browser (Chrome, Firefox, Edge)

### Step-by-Step

1. **Clone or download the project:**
   ```bash
   cd "Road Safety"
   ```

2. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Run the development server:**
   ```bash
   python -m uvicorn app:app --reload --host 0.0.0.0 --port 8000
   ```

4. **Open in browser:**
   Navigate to `http://localhost:8000`

---

## Usage Guide

### Location Lookup
1. Select your **Country** from the dropdown
2. Select your **State/Region**
3. View speed limits and local enforcement notes immediately
4. Optionally enable the **GPS Simulator** to simulate location transitions

### Challan Calculator
1. Ensure a region is selected (shown in the green badge)
2. Choose your **Vehicle Type** (2-Wheeler, 4-Wheeler, or Commercial)
3. Check the violations that apply
4. View the **Receipt Breakdown** with total fine at the bottom
5. Document expiry penalties are auto-detected and added

### Document Locker
1. Enter your document expiry dates
2. Click **Save Compliance Records** to persist locally
3. Status indicators show Valid / Expiring Soon / Expired
4. Expired documents automatically trigger penalty additions in the calculator

### Route Advisor
1. Select an **Origin** country and state
2. Select a **Destination** country and state
3. Click **Analyze Route Differences**
4. Review speed limit changes and fine disparities

---

## API Reference

### `GET /api/rules`
Returns the complete traffic rules database for offline synchronization.

### `POST /api/calculate`
Calculates the total fine for a set of violations in a specific region.

**Request Body:**
```json
{
    "country": "IN",
    "state": "DL",
    "violations": ["speeding", "no_helmet"],
    "is_expired_license": false,
    "is_expired_insurance": true,
    "is_expired_emissions": false
}
```

### `POST /api/route-compare`
Compares traffic regulations between two regions.

**Request Body:**
```json
{
    "origin_country": "US",
    "origin_state": "CA",
    "dest_country": "US",
    "dest_state": "NY"
}
```

---

## Offline Functionality

DriveLegal implements a robust offline-first strategy:

1. **Initial Load**: The app fetches the full rules database from the server and caches it in `localStorage`
2. **Service Worker**: All static assets (HTML, CSS, JS) are pre-cached for instant offline loading
3. **API Caching**: API responses are cached using a network-first strategy—fresh data when online, cached data when offline
4. **Auto-Sync**: When the device regains connectivity, the app automatically re-synchronizes the database
5. **Status Indicators**: Real-time visual feedback on sync and network status

---

## Project Structure

```
Road Safety/
├── app.py                      # FastAPI backend server
├── requirements.txt            # Python dependencies
├── README.md                   # Project documentation
├── data/
│   └── traffic_rules.json      # Traffic regulations database
├── static/
│   ├── index.html              # Main dashboard page
│   ├── sw.js                   # Service Worker for offline support
│   ├── css/
│   │   └── styles.css          # Glassmorphic styling
│   └── js/
│       └── app.js              # Frontend application logic
└── docs/
    └── SYSTEM_DESIGN.md        # Detailed system design document
```

---

## Roadmap & Future Scope

- [ ] **Expanded Database**: Coverage for EU countries (Germany, UK, France), ASEAN nations
- [ ] **Real GPS Integration**: Native Geolocation API for automatic region detection
- [ ] **Multilingual Support**: Interface translation for Hindi, Spanish, German
- [ ] **PDF Receipt Export**: Download challan breakdown as a printable PDF
- [ ] **Community Contributions**: Allow users to submit local rule updates for moderation
- [ ] **Push Notifications**: Alert users when their documents are about to expire
- [ ] **Dark/Light Mode Toggle**: User-selectable theme preference

---

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/new-region`)
3. Commit your changes (`git commit -m "Add Maharashtra traffic rules"`)
4. Push to the branch (`git push origin feature/new-region`)
5. Open a Pull Request

---

## License

This project is open-source and available under the [MIT License](LICENSE).

---

*Built for safe and legally compliant journeys.*
