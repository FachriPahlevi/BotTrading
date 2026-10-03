def calculate_brier_score(predictions):
    if not predictions:
        return 0.0
    
    squared_errors = []
    for p in predictions:
        prob = p["confidence"] / 100.0
        outcome = p["outcome"]
        squared_errors.append((prob - outcome) ** 2)
        
    return sum(squared_errors) / len(squared_errors)

def generate_reliability_report(predictions):
    bins = {
        "60_70": {"predicted_mid": 65.0, "total": 0, "wins": 0},
        "70_80": {"predicted_mid": 75.0, "total": 0, "wins": 0},
        "80_90": {"predicted_mid": 85.0, "total": 0, "wins": 0},
        "90_100": {"predicted_mid": 95.0, "total": 0, "wins": 0}
    }
    
    for p in predictions:
        conf = p["confidence"]
        outcome = p["outcome"]
        
        if 60 <= conf < 70:
            b = bins["60_70"]
        elif 70 <= conf < 80:
            b = bins["70_80"]
        elif 80 <= conf < 90:
            b = bins["80_90"]
        elif 90 <= conf <= 100:
            b = bins["90_100"]
        else:
            continue
            
        b["total"] += 1
        b["wins"] += outcome
        
    report = {}
    miscalibrated_flags = []
    
    for bin_name, b in bins.items():
        if b["total"] > 0:
            realized_winrate = (b["wins"] / b["total"]) * 100.0
        else:
            realized_winrate = 0.0
            
        error = abs(realized_winrate - b["predicted_mid"])
        
        if error > 15 and b["total"] >= 20:
            miscalibrated_flags.append(bin_name)
            
        report[bin_name] = {
            "predicted": b["predicted_mid"],
            "realized": realized_winrate,
            "n": b["total"],
            "calibration_error": error
        }
        
    total_samples = sum(b["n"] for b in report.values())
    is_valid_sample = total_samples >= 30
    
    return {
        "brier_score": calculate_brier_score(predictions),
        "bins": report,
        "is_valid_sample": is_valid_sample,
        "miscalibrated_bins": miscalibrated_flags
    }
