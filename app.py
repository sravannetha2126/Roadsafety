import json
import os
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Dict, Optional

app = FastAPI(
    title="DriveLegal Backend API",
    description="Backend service for location-based traffic rule lookup, challan calculations, and cross-border comparisons.",
    version="1.0.0"
)

# Load traffic rules database
RULES_FILE = os.path.join(os.path.dirname(__file__), "data", "traffic_rules.json")

def load_rules() -> dict:
    if not os.path.exists(RULES_FILE):
        return {}
    with open(RULES_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

# Request Models
class ChallanCalculationRequest(BaseModel):
    country: str
    state: str
    violations: List[str]
    is_expired_license: bool = False
    is_expired_insurance: bool = False
    is_expired_emissions: bool = False

class RouteComparisonRequest(BaseModel):
    origin_country: str
    origin_state: str
    dest_country: str
    dest_state: str

# API Endpoints
@app.get("/api/rules")
def get_rules():
    """Retrieve the entire traffic rules database. Used for synchronization and offline functionality."""
    try:
        rules = load_rules()
        return rules
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading traffic rules: {str(e)}")

@app.post("/api/calculate")
def calculate_challan(req: ChallanCalculationRequest):
    """Calculate the total fine based on local regulations and active violations."""
    rules = load_rules()
    
    country_data = rules.get("countries", {}).get(req.country)
    if not country_data:
        raise HTTPException(status_code=404, detail="Country not found in database")
        
    state_data = country_data.get("states", {}).get(req.state)
    if not state_data:
        raise HTTPException(status_code=404, detail="State/Region not found in database")
        
    fines = state_data.get("fines", {})
    currency = country_data.get("currency", "USD")
    currency_symbol = country_data.get("currency_symbol", "$")
    
    total = 0
    breakdown = []
    
    # Calculate base violations
    for violation in req.violations:
        if violation in fines:
            fine_amt = fines[violation]
            total += fine_amt
            breakdown.append({
                "violation": violation.replace("_", " ").title(),
                "fine": fine_amt,
                "type": "standard"
            })
            
    # Calculate document compliance violations
    if req.is_expired_license:
        fine_amt = fines.get("no_license", 0)
        total += fine_amt
        breakdown.append({
            "violation": "Driving with Expired License",
            "fine": fine_amt,
            "type": "document"
        })
        
    if req.is_expired_insurance:
        fine_amt = fines.get("no_insurance", 0)
        total += fine_amt
        breakdown.append({
            "violation": "Driving without Active Insurance",
            "fine": fine_amt,
            "type": "document"
        })
        
    if req.is_expired_emissions:
        fine_amt = fines.get("expired_pollution", 0)
        total += fine_amt
        breakdown.append({
            "violation": "Driving with Expired Emissions/PUC",
            "fine": fine_amt,
            "type": "document"
        })
        
    return {
        "country": req.country,
        "state": state_data.get("name"),
        "total_fine": total,
        "currency": currency,
        "currency_symbol": currency_symbol,
        "breakdown": breakdown
    }

@app.post("/api/route-compare")
def compare_route_rules(req: RouteComparisonRequest):
    """Compare regulations, limits, and document mandates between origin and destination."""
    rules = load_rules()
    
    # Get Origin Data
    origin_country_data = rules.get("countries", {}).get(req.origin_country)
    if not origin_country_data:
        raise HTTPException(status_code=404, detail="Origin country not found")
    origin_state_data = origin_country_data.get("states", {}).get(req.origin_state)
    if not origin_state_data:
        raise HTTPException(status_code=404, detail="Origin state not found")
        
    # Get Destination Data
    dest_country_data = rules.get("countries", {}).get(req.dest_country)
    if not dest_country_data:
        raise HTTPException(status_code=404, detail="Destination country not found")
    dest_state_data = dest_country_data.get("states", {}).get(req.dest_state)
    if not dest_state_data:
        raise HTTPException(status_code=404, detail="Destination state not found")
        
    # Compile comparisons
    comparison = {
        "origin": {
            "name": f"{origin_state_data.get('name')}, {origin_country_data.get('name')}",
            "speed_limits": origin_state_data.get("speed_limits", {}),
            "currency_symbol": origin_country_data.get("currency_symbol", "$"),
            "fines": origin_state_data.get("fines", {}),
            "notes": origin_state_data.get("local_notes", "")
        },
        "destination": {
            "name": f"{dest_state_data.get('name')}, {dest_country_data.get('name')}",
            "speed_limits": dest_state_data.get("speed_limits", {}),
            "currency_symbol": dest_country_data.get("currency_symbol", "$"),
            "fines": dest_state_data.get("fines", {}),
            "notes": dest_state_data.get("local_notes", "")
        },
        "differences": []
    }
    
    # Compare speed limits
    o_limits = origin_state_data.get("speed_limits", {})
    d_limits = dest_state_data.get("speed_limits", {})
    for road_type in ["highway", "urban", "residential"]:
        ol = o_limits.get(road_type)
        dl = d_limits.get(road_type)
        if ol != dl:
            comparison["differences"].append({
                "type": "speed_limit",
                "category": road_type.capitalize(),
                "message": f"Speed limit on {road_type}s changes from {ol} to {dl} units."
            })
            
    # Compare fine structures
    o_fines = origin_state_data.get("fines", {})
    d_fines = dest_state_data.get("fines", {})
    for violation in o_fines.keys():
        of = o_fines.get(violation)
        df = d_fines.get(violation)
        if of is not None and df is not None:
            # Handle difference if currencies are same or convert representation
            if of != df or req.origin_country != req.dest_country:
                o_curr = origin_country_data.get("currency_symbol", "$")
                d_curr = dest_country_data.get("currency_symbol", "$")
                comparison["differences"].append({
                    "type": "fine_difference",
                    "category": violation.replace("_", " ").capitalize(),
                    "message": f"Penalty changes from {o_curr}{of} in origin to {d_curr}{df} in destination."
                })
                
    return comparison

# Serve web static directory
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/")
def get_index():
    """Serves the main front-end entry point."""
    index_file = os.path.join(static_dir, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return {"status": "success", "message": "DriveLegal API is active. Front-end not loaded."}
