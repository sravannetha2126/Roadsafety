# DriveLegal — System Design Document

## 1. Overview

DriveLegal is an offline-first, location-aware traffic regulation platform designed to help citizens navigate the complexity of differing traffic laws across states and countries. This document describes the engineering architecture, key design decisions, data flow, and offline synchronization strategy.

---

## 2. Design Principles

1. **Offline-First**: The application must remain fully functional without network connectivity. All critical data and computations must be available client-side.
2. **Data Accuracy**: Fine amounts, speed limits, and document mandates are sourced from official government gazettes and regulatory bodies. The JSON database is the single source of truth.
3. **Privacy by Design**: No user data (document dates, location selections) is transmitted to any server. All personal data is stored exclusively in the browser's `localStorage`.
4. **Modularity**: Each feature (Location, Calculator, Documents, Route Advisor) is an independent module that can be developed, tested, and maintained separately.
5. **Progressive Enhancement**: The platform works as a basic HTML page even without JavaScript. CSS provides a baseline experience, and JS adds interactivity.

---

## 3. System Architecture

### 3.1 Component Diagram

```
┌──────────────────────────────────────────────────────────┐
│                    CLIENT (Browser)                      │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │               Application Shell                   │   │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────────────┐ │   │
│  │  │ Location  │ │ Challan  │ │  Route Advisor    │ │   │
│  │  │ Module    │ │ Calc     │ │  Module           │ │   │
│  │  └──────────┘ └──────────┘ └───────────────────┘ │   │
│  │  ┌──────────────────────────────────────────────┐ │   │
│  │  │      Document Compliance Module              │ │   │
│  │  └──────────────────────────────────────────────┘ │   │
│  └──────────────────┬───────────────────────────────┘   │
│                     │                                    │
│  ┌──────────────────▼───────────────────────────────┐   │
│  │            State Management Layer                 │   │
│  │  ┌─────────────┐    ┌───────────────────────┐    │   │
│  │  │ localStorage│    │    Service Worker      │    │   │
│  │  │ (user data, │    │ (asset cache,          │    │   │
│  │  │  rules DB)  │    │  API response cache)   │    │   │
│  │  └─────────────┘    └───────────────────────┘    │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
└──────────────────────────┬───────────────────────────────┘
                           │
              HTTP/HTTPS (when available)
                           │
┌──────────────────────────▼───────────────────────────────┐
│                   SERVER (FastAPI)                        │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  Rules API   │  │ Calculate    │  │ Route Compare │  │
│  │  Endpoint    │  │ Endpoint     │  │ Endpoint      │  │
│  └──────┬───────┘  └──────┬───────┘  └───────┬───────┘  │
│         │                 │                   │          │
│  ┌──────▼─────────────────▼───────────────────▼───────┐  │
│  │            JSON File Database                      │  │
│  │         (data/traffic_rules.json)                  │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 3.2 Data Flow

1. **On Application Load**:
   - Frontend attempts to `fetch("/api/rules")` from the FastAPI backend
   - On success: Response is stored in `localStorage` and used to populate all dropdowns and calculations
   - On failure: Cached `localStorage` data is used as fallback
   - UI status badges update to reflect sync/network state

2. **Challan Calculation**:
   - User selects violations via checkboxes
   - `recalculateChallan()` reads the rules database from memory
   - Fine amounts are looked up from `rulesDatabase.countries[country].states[state].fines`
   - Document expiry penalties are automatically added
   - Receipt is rendered client-side — no server call required

3. **Route Comparison**:
   - Performed entirely client-side using the cached rules database
   - Compares speed limits and fine structures between origin and destination
   - Renders a timeline of differences with visual categorization

---

## 4. Offline Synchronization Strategy

### 4.1 Service Worker Lifecycle

| Phase | Action |
|-------|--------|
| **Install** | Pre-cache static shell (HTML, CSS, JS) |
| **Activate** | Clean up outdated cache versions |
| **Fetch (Static)** | Cache-first: serve from cache, fetch and cache on miss |
| **Fetch (API)** | Network-first: try server, cache response, fall back to cache on error |

### 4.2 localStorage Schema

| Key | Description | Format |
|-----|-------------|--------|
| `drivelegal_rules_db` | Full traffic rules database | JSON string |
| `drivelegal_doc_license` | Driving license expiry date | ISO date string |
| `drivelegal_doc_insurance` | Insurance expiry date | ISO date string |
| `drivelegal_doc_emissions` | Emissions/PUC expiry date | ISO date string |
| `drivelegal_sel_country` | Last selected country code | String (e.g., "IN") |
| `drivelegal_sel_state` | Last selected state code | String (e.g., "DL") |
| `drivelegal_last_sync` | Timestamp of last successful sync | ISO datetime string |

### 4.3 Conflict Resolution

Since the rules database is read-only from the user's perspective, there are no write conflicts. The sync strategy is simple:
- Server data always wins (latest version replaces cached version)
- User preferences (document dates, selected location) are local-only and never synced to the server

---

## 5. Rules Resolution Engine

### 5.1 Database Structure

The traffic rules are organized in a hierarchical JSON structure:

```
countries → {country_code} → states → {state_code} → {fines, speed_limits, mandatory_documents, local_notes}
```

### 5.2 Fine Lookup Algorithm

```
FUNCTION calculateFine(country, state, violations, documents):
    fines = database[country][state].fines
    total = 0
    breakdown = []
    
    FOR each violation IN violations:
        IF violation EXISTS in fines:
            total += fines[violation]
            breakdown.ADD(violation, fines[violation])
    
    FOR each document IN documents:
        IF document.is_expired:
            penalty_key = document.penalty_mapping_key
            total += fines[penalty_key]
            breakdown.ADD(document.name, fines[penalty_key])
    
    RETURN {total, breakdown}
```

### 5.3 Route Comparison Algorithm

```
FUNCTION compareRoutes(origin, destination):
    differences = []
    
    FOR each road_type IN [highway, urban, residential]:
        IF origin.speed_limits[road_type] != destination.speed_limits[road_type]:
            differences.ADD(speed_limit_change)
    
    FOR each violation_type IN origin.fines:
        IF origin.fines[violation_type] != destination.fines[violation_type]:
            differences.ADD(fine_change)
        ELSE IF origin.currency != destination.currency:
            differences.ADD(currency_change_note)
    
    RETURN differences
```

---

## 6. Security Considerations

1. **No Authentication Required**: The platform provides public regulatory information. No user accounts are needed.
2. **No Server-Side Storage of Personal Data**: Document expiry dates and preferences never leave the browser.
3. **Input Validation**: FastAPI uses Pydantic models for strict request validation on all API endpoints.
4. **CORS**: Not configured by default (same-origin served). Can be added if deployed as a separate API.
5. **Content Security**: Static files are served directly by FastAPI; no CDN or third-party file injection.

---

## 7. Performance Considerations

1. **Lightweight Payload**: The entire rules database JSON is less than 10KB, enabling instant caching and fast lookups.
2. **No External Framework Dependencies**: Vanilla JS eliminates framework overhead. The app loads in under 500ms on 3G.
3. **Service Worker Pre-Caching**: Static assets are cached on first visit. Subsequent visits load instantly from disk.
4. **Client-Side Computation**: All calculations happen in the browser. The server is only needed for initial data sync.
5. **Minimal DOM Manipulation**: UI updates use targeted `innerHTML` replacements rather than full re-renders.

---

## 8. Scalability Path

### Adding a New Country/State

1. Open `data/traffic_rules.json`
2. Add a new entry under the appropriate country's `states` object
3. Include `fines`, `speed_limits`, `mandatory_documents`, and `local_notes`
4. Restart the server — the frontend automatically picks up new entries

### Adding a New Violation Type

1. Add the violation key and fine amount to each state's `fines` object
2. Add a corresponding checkbox in `index.html`
3. The calculator engine automatically includes any checked violation present in the fines database

---

*This document is maintained as part of the DriveLegal project and should be updated when architectural decisions change.*
