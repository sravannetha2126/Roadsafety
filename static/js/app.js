/**
 * DriveLegal - Smart Traffic Compliance Platform
 * Core Frontend Application Module
 * 
 * Handles: Data synchronization, geofenced location lookup,
 * challan/fine calculation, document compliance validation,
 * cross-border route comparison, and offline-first storage.
 */

(function () {
    "use strict";

    // ─── Constants & Config ───────────────────────────────────────────
    const STORAGE_KEYS = {
        RULES_DB: "drivelegal_rules_db",
        DOC_LICENSE: "drivelegal_doc_license",
        DOC_INSURANCE: "drivelegal_doc_insurance",
        DOC_EMISSIONS: "drivelegal_doc_emissions",
        SELECTED_COUNTRY: "drivelegal_sel_country",
        SELECTED_STATE: "drivelegal_sel_state",
        LAST_SYNC: "drivelegal_last_sync",
    };

    const API_BASE = "";

    // ─── Application State ────────────────────────────────────────────
    let rulesDatabase = null;
    let selectedCountry = null;
    let selectedState = null;
    let selectedVehicleType = "two_wheeler";

    // ─── DOM References ───────────────────────────────────────────────
    const dom = {
        // Status
        syncStatus: document.getElementById("sync-status"),
        networkStatus: document.getElementById("network-status"),

        // Location
        countrySelector: document.getElementById("country-selector"),
        stateSelector: document.getElementById("state-selector"),
        gpsToggle: document.getElementById("gps-toggle"),
        gpsCoordsDisplay: document.getElementById("gps-coords-display"),
        gpsButtonsContainer: document.getElementById("gps-buttons-container"),
        limitHighway: document.getElementById("limit-highway"),
        limitUrban: document.getElementById("limit-urban"),
        limitResidential: document.getElementById("limit-residential"),
        localNotesText: document.getElementById("local-notes-text"),

        // Document Locker
        docLicenseExpiry: document.getElementById("doc-license-expiry"),
        docInsuranceExpiry: document.getElementById("doc-insurance-expiry"),
        docEmissionsExpiry: document.getElementById("doc-emissions-expiry"),
        statusLicense: document.getElementById("status-license"),
        statusInsurance: document.getElementById("status-insurance"),
        statusEmissions: document.getElementById("status-emissions"),
        docLockerForm: document.getElementById("doc-locker-form"),

        // Calculator
        calcRegionBadge: document.getElementById("calc-region-badge"),
        helmetSeatbeltContainer: document.getElementById("helmet-seatbelt-container"),
        helmetSeatbeltCheckbox: document.getElementById("helmet-seatbelt-checkbox"),
        helmetSeatbeltLabel: document.getElementById("helmet-seatbelt-label"),
        receiptItemsContainer: document.getElementById("receipt-items-container"),
        receiptTotal: document.getElementById("receipt-total"),
        receiptDate: document.getElementById("receipt-date"),

        // Auto-detected document violations in calculator
        autoLicRow: document.getElementById("auto-lic-row"),
        autoInsRow: document.getElementById("auto-ins-row"),
        autoEmiRow: document.getElementById("auto-emi-row"),
        autoLicFine: document.getElementById("auto-lic-fine"),
        autoInsFine: document.getElementById("auto-ins-fine"),
        autoEmiFine: document.getElementById("auto-emi-fine"),
        allDocsValidMsg: document.getElementById("all-docs-valid-msg"),

        // Route Advisor
        routeOriginCountry: document.getElementById("route-origin-country"),
        routeOriginState: document.getElementById("route-origin-state"),
        routeDestCountry: document.getElementById("route-dest-country"),
        routeDestState: document.getElementById("route-dest-state"),
        btnCompareRoute: document.getElementById("btn-compare-route"),
        routeAnalysisResults: document.getElementById("route-analysis-results"),
        routeDifferencesList: document.getElementById("route-differences-list"),
    };

    // ─── Utility Helpers ──────────────────────────────────────────────

    function formatDate(dateStr) {
        if (!dateStr) return null;
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? null : d;
    }

    function isExpired(dateStr) {
        const d = formatDate(dateStr);
        if (!d) return false; // No date means we don't penalize
        return d < new Date();
    }

    function isExpiringSoon(dateStr, daysThreshold) {
        const d = formatDate(dateStr);
        if (!d) return false;
        const now = new Date();
        const diff = (d - now) / (1000 * 60 * 60 * 24);
        return diff > 0 && diff <= daysThreshold;
    }

    function getCurrentMonthYear() {
        const now = new Date();
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
            "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return months[now.getMonth()] + " " + now.getFullYear();
    }

    // ─── Data Sync Engine ─────────────────────────────────────────────

    async function syncRulesDatabase() {
        updateSyncStatus("syncing");

        try {
            const response = await fetch(API_BASE + "/api/rules");
            if (!response.ok) throw new Error("Server responded with " + response.status);

            const data = await response.json();
            rulesDatabase = data;
            localStorage.setItem(STORAGE_KEYS.RULES_DB, JSON.stringify(data));
            localStorage.setItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());

            updateSyncStatus("synced");
            updateNetworkStatus(true);
            return true;
        } catch (err) {
            console.warn("Sync failed, falling back to local cache:", err.message);
            const cached = localStorage.getItem(STORAGE_KEYS.RULES_DB);
            if (cached) {
                rulesDatabase = JSON.parse(cached);
                updateSyncStatus("cached");
            } else {
                updateSyncStatus("error");
            }
            updateNetworkStatus(false);
            return false;
        }
    }

    function updateSyncStatus(status) {
        const el = dom.syncStatus;
        el.className = "status-badge";

        switch (status) {
            case "syncing":
                el.className += " sync-active";
                el.innerHTML = '<i class="fa-solid fa-arrows-rotate spinner"></i><span>Synchronizing...</span>';
                break;
            case "synced":
                el.className += " sync-done";
                el.innerHTML = '<i class="fa-solid fa-circle-check"></i><span>Synced</span>';
                break;
            case "cached":
                el.className += " sync-done";
                el.innerHTML = '<i class="fa-solid fa-database"></i><span>Offline (Cached)</span>';
                break;
            case "error":
                el.className += " offline";
                el.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i><span>No Data</span>';
                break;
        }
    }

    function updateNetworkStatus(isOnline) {
        const el = dom.networkStatus;
        if (isOnline) {
            el.className = "status-badge online";
            el.innerHTML = '<i class="fa-solid fa-wifi"></i><span>Online</span>';
        } else {
            el.className = "status-badge offline";
            el.innerHTML = '<i class="fa-solid fa-wifi"></i><span>Offline</span>';
        }
    }

    // ─── Location / Geofencing Module ─────────────────────────────────

    function populateCountryDropdowns() {
        if (!rulesDatabase || !rulesDatabase.countries) return;

        const countries = rulesDatabase.countries;
        const targets = [dom.countrySelector, dom.routeOriginCountry, dom.routeDestCountry];

        targets.forEach(function (sel) {
            sel.innerHTML = '<option value="">-- Select Country --</option>';
            Object.keys(countries).forEach(function (code) {
                const opt = document.createElement("option");
                opt.value = code;
                opt.textContent = countries[code].name;
                sel.appendChild(opt);
            });
        });

        // Restore previous selection
        const savedCountry = localStorage.getItem(STORAGE_KEYS.SELECTED_COUNTRY);
        if (savedCountry && countries[savedCountry]) {
            dom.countrySelector.value = savedCountry;
            onCountryChange(savedCountry);
        }
    }

    function populateStateDropdown(countryCode, targetSelect, callback) {
        targetSelect.innerHTML = '<option value="">-- Select State / Region --</option>';

        if (!countryCode || !rulesDatabase || !rulesDatabase.countries[countryCode]) return;

        const states = rulesDatabase.countries[countryCode].states;
        Object.keys(states).forEach(function (stateCode) {
            const opt = document.createElement("option");
            opt.value = stateCode;
            opt.textContent = states[stateCode].name;
            targetSelect.appendChild(opt);
        });

        if (callback) callback();
    }

    function onCountryChange(countryCode) {
        selectedCountry = countryCode;
        localStorage.setItem(STORAGE_KEYS.SELECTED_COUNTRY, countryCode);

        populateStateDropdown(countryCode, dom.stateSelector, function () {
            const savedState = localStorage.getItem(STORAGE_KEYS.SELECTED_STATE);
            if (savedState && rulesDatabase.countries[countryCode] &&
                rulesDatabase.countries[countryCode].states[savedState]) {
                dom.stateSelector.value = savedState;
                onStateChange(savedState);
            } else {
                clearRegionDisplay();
            }
        });
    }

    function onStateChange(stateCode) {
        selectedState = stateCode;
        localStorage.setItem(STORAGE_KEYS.SELECTED_STATE, stateCode);
        updateRegionDisplay();
        updateCalculatorBadge();
        updateDocumentComplianceDisplay();
        recalculateChallan();
    }

    function updateRegionDisplay() {
        if (!selectedCountry || !selectedState || !rulesDatabase) return;

        const stateData = rulesDatabase.countries[selectedCountry].states[selectedState];
        if (!stateData) return;

        const limits = stateData.speed_limits || {};
        dom.limitHighway.textContent = limits.highway ? limits.highway : "--";
        dom.limitUrban.textContent = limits.urban ? limits.urban : "--";
        dom.limitResidential.textContent = limits.residential ? limits.residential : "--";

        dom.localNotesText.textContent = stateData.local_notes || "No specific local enforcement notes available.";

        // Animate the region pane
        const pane = document.getElementById("region-info-pane");
        pane.style.animation = "none";
        void pane.offsetHeight; // Trigger reflow
        pane.style.animation = "fadeIn 0.3s ease";
    }

    function clearRegionDisplay() {
        dom.limitHighway.textContent = "--";
        dom.limitUrban.textContent = "--";
        dom.limitResidential.textContent = "--";
        dom.localNotesText.textContent = "Select a location to see local guidelines.";
    }

    function updateCalculatorBadge() {
        if (selectedCountry && selectedState && rulesDatabase) {
            const stateName = rulesDatabase.countries[selectedCountry].states[selectedState].name;
            const countryName = rulesDatabase.countries[selectedCountry].name;
            dom.calcRegionBadge.textContent = stateName + ", " + countryName;
            dom.calcRegionBadge.className = "badge badge-success";
        } else {
            dom.calcRegionBadge.textContent = "No Region Selected";
            dom.calcRegionBadge.className = "badge badge-warning";
        }
    }

    // ─── GPS Simulator Module ─────────────────────────────────────────

    function initGpsSimulator() {
        dom.gpsToggle.addEventListener("change", function () {
            if (this.checked) {
                dom.gpsCoordsDisplay.textContent = "GPS Simulator: Active – Use buttons below to simulate location.";
                dom.gpsButtonsContainer.style.display = "flex";
            } else {
                dom.gpsCoordsDisplay.textContent = "GPS Tracking: Disabled (Using manual selection)";
                dom.gpsButtonsContainer.style.display = "none";
            }
        });

        // Simulator buttons
        var simButtons = dom.gpsButtonsContainer.querySelectorAll("button[data-state]");
        simButtons.forEach(function (btn) {
            btn.addEventListener("click", function () {
                var country = this.getAttribute("data-country");
                var state = this.getAttribute("data-state");

                // Map of simulated coordinates
                var coords = {
                    "DL": { lat: "28.6139", lng: "77.2090" },
                    "KA": { lat: "12.9716", lng: "77.5946" },
                    "MH": { lat: "19.0760", lng: "72.8777" },
                    "CA": { lat: "36.7783", lng: "-119.4179" },
                    "NY": { lat: "40.7128", lng: "-74.0060" },
                    "TX": { lat: "31.9686", lng: "-99.9018" }
                };

                var c = coords[state] || { lat: "0.0", lng: "0.0" };
                dom.gpsCoordsDisplay.innerHTML =
                    "Simulated GPS Position: <strong>" + c.lat + "°N, " + c.lng + "°E</strong> — Auto-selecting region...";

                // Auto-set the dropdowns
                dom.countrySelector.value = country;
                onCountryChange(country);

                // Slight delay for state population
                setTimeout(function () {
                    dom.stateSelector.value = state;
                    onStateChange(state);
                }, 100);

                // Highlight the active button
                simButtons.forEach(function (b) { b.classList.remove("active"); });
                this.classList.add("active");
            });
        });
    }

    // ─── Vehicle Type Module ──────────────────────────────────────────

    function initVehicleSelector() {
        var vehicleBtns = document.querySelectorAll(".vehicle-btn");

        vehicleBtns.forEach(function (btn) {
            btn.addEventListener("click", function () {
                vehicleBtns.forEach(function (b) { b.classList.remove("active"); });
                this.classList.add("active");
                selectedVehicleType = this.getAttribute("data-type");
                updateHelmetSeatbeltLabel();
                recalculateChallan();
            });
        });
    }

    function updateHelmetSeatbeltLabel() {
        if (selectedVehicleType === "two_wheeler") {
            dom.helmetSeatbeltCheckbox.value = "no_helmet";
            dom.helmetSeatbeltLabel.innerHTML =
                '<strong>No Helmet</strong><small>Rider/Pillion rider without protective headgear</small>';
        } else {
            dom.helmetSeatbeltCheckbox.value = "seatbelt";
            dom.helmetSeatbeltLabel.innerHTML =
                '<strong>No Seatbelt</strong><small>Driver/Passenger not wearing seatbelt</small>';
        }
    }

    // ─── Document Compliance Module ───────────────────────────────────

    function initDocumentLocker() {
        // Restore saved dates
        var savedLic = localStorage.getItem(STORAGE_KEYS.DOC_LICENSE);
        var savedIns = localStorage.getItem(STORAGE_KEYS.DOC_INSURANCE);
        var savedEmi = localStorage.getItem(STORAGE_KEYS.DOC_EMISSIONS);

        if (savedLic) dom.docLicenseExpiry.value = savedLic;
        if (savedIns) dom.docInsuranceExpiry.value = savedIns;
        if (savedEmi) dom.docEmissionsExpiry.value = savedEmi;

        // Real-time check on change
        dom.docLicenseExpiry.addEventListener("change", function () {
            updateDocumentComplianceDisplay();
            recalculateChallan();
        });
        dom.docInsuranceExpiry.addEventListener("change", function () {
            updateDocumentComplianceDisplay();
            recalculateChallan();
        });
        dom.docEmissionsExpiry.addEventListener("change", function () {
            updateDocumentComplianceDisplay();
            recalculateChallan();
        });

        // Save on form submit
        dom.docLockerForm.addEventListener("submit", function (e) {
            e.preventDefault();
            localStorage.setItem(STORAGE_KEYS.DOC_LICENSE, dom.docLicenseExpiry.value);
            localStorage.setItem(STORAGE_KEYS.DOC_INSURANCE, dom.docInsuranceExpiry.value);
            localStorage.setItem(STORAGE_KEYS.DOC_EMISSIONS, dom.docEmissionsExpiry.value);

            updateDocumentComplianceDisplay();
            recalculateChallan();

            // Quick success feedback on button
            var btn = this.querySelector("button[type=submit]");
            var origHTML = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Saved Successfully!';
            btn.style.background = "linear-gradient(135deg, #10b981, #059669)";
            setTimeout(function () {
                btn.innerHTML = origHTML;
                btn.style.background = "";
            }, 2000);
        });

        updateDocumentComplianceDisplay();
    }

    function updateDocumentComplianceDisplay() {
        updateSingleDocStatus(dom.docLicenseExpiry.value, dom.statusLicense);
        updateSingleDocStatus(dom.docInsuranceExpiry.value, dom.statusInsurance);
        updateSingleDocStatus(dom.docEmissionsExpiry.value, dom.statusEmissions);

        // Update calculator auto-violation section
        var licExpired = isExpired(dom.docLicenseExpiry.value);
        var insExpired = isExpired(dom.docInsuranceExpiry.value);
        var emiExpired = isExpired(dom.docEmissionsExpiry.value);
        var anyExpired = licExpired || insExpired || emiExpired;

        dom.autoLicRow.style.display = licExpired ? "flex" : "none";
        dom.autoInsRow.style.display = insExpired ? "flex" : "none";
        dom.autoEmiRow.style.display = emiExpired ? "flex" : "none";
        dom.allDocsValidMsg.style.display = anyExpired ? "none" : "flex";

        // Update fine amounts if region is selected
        if (selectedCountry && selectedState && rulesDatabase) {
            var fines = rulesDatabase.countries[selectedCountry].states[selectedState].fines;
            var sym = rulesDatabase.countries[selectedCountry].currency_symbol;
            dom.autoLicFine.textContent = sym + (fines.no_license || 0);
            dom.autoInsFine.textContent = sym + (fines.no_insurance || 0);
            dom.autoEmiFine.textContent = sym + (fines.expired_pollution || 0);
        }
    }

    function updateSingleDocStatus(dateVal, statusEl) {
        if (!dateVal) {
            statusEl.textContent = "No Date Provided";
            statusEl.className = "doc-status-msg";
            return;
        }

        if (isExpired(dateVal)) {
            statusEl.textContent = "EXPIRED – Penalty may apply";
            statusEl.className = "doc-status-msg expired";
        } else if (isExpiringSoon(dateVal, 30)) {
            statusEl.textContent = "Expiring Soon (within 30 days)";
            statusEl.className = "doc-status-msg warning";
        } else {
            statusEl.textContent = "Valid";
            statusEl.className = "doc-status-msg valid";
        }
    }

    // ─── Challan Calculator Module ────────────────────────────────────

    function initChallanCalculator() {
        var checkboxes = document.querySelectorAll(".violation-checkbox");
        checkboxes.forEach(function (cb) {
            cb.addEventListener("change", recalculateChallan);
        });

        dom.receiptDate.textContent = getCurrentMonthYear();
    }

    function recalculateChallan() {
        if (!selectedCountry || !selectedState || !rulesDatabase) {
            dom.receiptItemsContainer.innerHTML =
                '<div class="empty-receipt-msg">Select a region first to calculate fines.</div>';
            dom.receiptTotal.textContent = "0.00";
            return;
        }

        var countryData = rulesDatabase.countries[selectedCountry];
        var stateData = countryData.states[selectedState];
        var fines = stateData.fines;
        var sym = countryData.currency_symbol;

        var total = 0;
        var items = [];

        // Checked violations
        var checkboxes = document.querySelectorAll(".violation-checkbox:checked");
        checkboxes.forEach(function (cb) {
            var violationKey = cb.value;
            var amount = fines[violationKey] || 0;
            total += amount;
            items.push({
                name: violationKey.replace(/_/g, " ").replace(/\b\w/g, function (l) { return l.toUpperCase(); }),
                amount: amount,
                type: "violation"
            });
        });

        // Document compliance violations
        if (isExpired(dom.docLicenseExpiry.value)) {
            var licFine = fines.no_license || 0;
            total += licFine;
            items.push({ name: "Expired Driving License", amount: licFine, type: "document" });
        }
        if (isExpired(dom.docInsuranceExpiry.value)) {
            var insFine = fines.no_insurance || 0;
            total += insFine;
            items.push({ name: "Expired / No Insurance", amount: insFine, type: "document" });
        }
        if (isExpired(dom.docEmissionsExpiry.value)) {
            var emiFine = fines.expired_pollution || 0;
            total += emiFine;
            items.push({ name: "Expired Emissions / PUC", amount: emiFine, type: "document" });
        }

        // Render receipt
        if (items.length === 0) {
            dom.receiptItemsContainer.innerHTML =
                '<div class="empty-receipt-msg">No violations selected</div>';
        } else {
            dom.receiptItemsContainer.innerHTML = items.map(function (item) {
                var typeLabel = item.type === "document"
                    ? ' <span style="color: var(--warning); font-size: 0.7rem;">(DOC)</span>'
                    : '';
                return '<div class="receipt-item">' +
                    '<span class="item-name">' + item.name + typeLabel + '</span>' +
                    '<span class="item-value">' + sym + item.amount.toLocaleString() + '</span>' +
                    '</div>';
            }).join("");
        }

        dom.receiptTotal.textContent = sym + total.toLocaleString();

        // Animate total if non-zero
        if (total > 0) {
            dom.receiptTotal.style.animation = "none";
            void dom.receiptTotal.offsetHeight;
            dom.receiptTotal.style.animation = "fadeIn 0.3s ease";
        }
    }

    // ─── Cross-Border Route Advisor Module ────────────────────────────

    function initRouteAdvisor() {
        // Populate route selectors
        dom.routeOriginCountry.addEventListener("change", function () {
            populateStateDropdown(this.value, dom.routeOriginState);
        });
        dom.routeDestCountry.addEventListener("change", function () {
            populateStateDropdown(this.value, dom.routeDestState);
        });

        dom.btnCompareRoute.addEventListener("click", performRouteComparison);
    }

    function performRouteComparison() {
        var oc = dom.routeOriginCountry.value;
        var os = dom.routeOriginState.value;
        var dc = dom.routeDestCountry.value;
        var ds = dom.routeDestState.value;

        if (!oc || !os || !dc || !ds) {
            alert("Please select both origin and destination regions to compare.");
            return;
        }

        if (oc === dc && os === ds) {
            dom.routeAnalysisResults.style.display = "block";
            dom.routeDifferencesList.innerHTML =
                '<div class="empty-receipt-msg" style="padding: 1rem; text-align: center;">' +
                '<i class="fa-solid fa-circle-check text-success" style="font-size: 1.5rem;"></i>' +
                '<p style="margin-top: 0.5rem;">Origin and destination are in the same region. No rule differences detected.</p></div>';
            return;
        }

        // Try API first, fall back to local computation
        performLocalRouteComparison(oc, os, dc, ds);
    }

    function performLocalRouteComparison(oc, os, dc, ds) {
        if (!rulesDatabase) return;

        var originCountry = rulesDatabase.countries[oc];
        var destCountry = rulesDatabase.countries[dc];
        if (!originCountry || !destCountry) return;

        var originState = originCountry.states[os];
        var destState = destCountry.states[ds];
        if (!originState || !destState) return;

        var differences = [];

        // Compare speed limits
        var oLimits = originState.speed_limits || {};
        var dLimits = destState.speed_limits || {};
        ["highway", "urban", "residential"].forEach(function (roadType) {
            var ol = oLimits[roadType];
            var dl = dLimits[roadType];
            if (ol !== undefined && dl !== undefined && ol !== dl) {
                var unit = (oc === "IN" && dc === "IN") ? "km/h" :
                    (oc === "US" && dc === "US") ? "mph" : "units";
                var warning = dl < ol ? " ⚠️ Lower limit at destination!" : "";
                differences.push({
                    type: "speed_limit",
                    category: roadType.charAt(0).toUpperCase() + roadType.slice(1) + " Speed Limit",
                    message: "Changes from " + ol + " " + unit + " to " + dl + " " + unit + "." + warning
                });
            }
        });

        // Compare fines
        var oFines = originState.fines || {};
        var dFines = destState.fines || {};
        var oSym = originCountry.currency_symbol;
        var dSym = destCountry.currency_symbol;

        Object.keys(oFines).forEach(function (violation) {
            var of_ = oFines[violation];
            var df = dFines[violation];
            if (of_ !== undefined && df !== undefined && (of_ !== df || oc !== dc)) {
                var label = violation.replace(/_/g, " ").replace(/\b\w/g, function (l) { return l.toUpperCase(); });
                differences.push({
                    type: "fine_difference",
                    category: label + " Fine",
                    message: "Penalty changes from " + oSym + of_.toLocaleString() +
                        " to " + dSym + df.toLocaleString() + "."
                });
            }
        });

        // Render differences
        dom.routeAnalysisResults.style.display = "block";

        if (differences.length === 0) {
            dom.routeDifferencesList.innerHTML =
                '<div class="empty-receipt-msg" style="padding: 1rem; text-align: center;">' +
                '<i class="fa-solid fa-circle-check text-success" style="font-size: 1.5rem;"></i>' +
                '<p style="margin-top: 0.5rem;">No significant rule differences found between these regions.</p></div>';
        } else {
            dom.routeDifferencesList.innerHTML = differences.map(function (diff) {
                return '<div class="timeline-item ' + diff.type + '">' +
                    '<div class="timeline-title">' + diff.category + '</div>' +
                    '<div class="timeline-desc">' + diff.message + '</div>' +
                    '</div>';
            }).join("");
        }

        // Smooth scroll to results
        dom.routeAnalysisResults.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    // ─── Service Worker Registration ──────────────────────────────────

    function registerServiceWorker() {
        if ("serviceWorker" in navigator) {
            navigator.serviceWorker.register("/static/sw.js")
                .then(function (reg) {
                    console.log("Service Worker registered with scope:", reg.scope);
                })
                .catch(function (err) {
                    console.warn("Service Worker registration skipped:", err.message);
                });
        }
    }

    // ─── Network Status Detection ─────────────────────────────────────

    function initNetworkDetection() {
        window.addEventListener("online", function () {
            updateNetworkStatus(true);
            syncRulesDatabase(); // Re-sync when back online
        });
        window.addEventListener("offline", function () {
            updateNetworkStatus(false);
        });
    }

    // ─── Initialize Application ───────────────────────────────────────

    async function init() {
        // Sync data (tries server, falls back to cache)
        await syncRulesDatabase();

        // Populate UI
        populateCountryDropdowns();

        // Attach event listeners
        dom.countrySelector.addEventListener("change", function () {
            onCountryChange(this.value);
        });
        dom.stateSelector.addEventListener("change", function () {
            onStateChange(this.value);
        });

        // Initialize modules
        initGpsSimulator();
        initVehicleSelector();
        initDocumentLocker();
        initChallanCalculator();
        initRouteAdvisor();
        initNetworkDetection();
        registerServiceWorker();

        console.log("DriveLegal application initialized successfully.");
    }

    // Boot up when DOM is ready
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

})();
