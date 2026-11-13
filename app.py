"""Al Doha Food Industries - plant operations dashboard.

Run:   python app.py        then open http://localhost:8020
Port:  set the PORT environment variable to change it.

Standard library only - nothing to pip install. Every figure on the dashboard
is DEMO data owned by this file: the browser loads it once from /api/config
and polls /api/live every few seconds for the readings that move (machine
loads, plant power demand, truck speed and fuel). Reports are rendered here as
PDF (with the Schneider Electric and AVEVA logos) or CSV by /api/report. Replace the demo tables with PLC / SCADA / ERP /
telematics calls when those integrations exist.
"""
import csv
import gzip
import io
import json
import math
import mimetypes
import os
import random
import struct
import threading
import time
import zlib
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
TEMPLATE = ROOT / "templates" / "index.html"
PORT = int(os.environ.get("PORT", "8020"))


def kpi(label, value, sub="", tone="", icon="", viz=None, go=None):
    """One KPI card. tone: 'up' (good) / 'dn' (needs attention). go: [page, tab]."""
    return {"l": label, "v": value, "s": sub, "c": tone, "i": icon, "viz": viz, "go": go}


def fmt(x, d=0):
    return f"{x:,.{d}f}"


# --------------------------------------------------------------------------- navigation
PAGES = [
    {"id": "overview", "name": "Overview", "icon": "overview", "group": "Operations", "acc": "#0a9d55"},
    {"id": "factories", "name": "Factories", "icon": "factory", "group": "Operations", "acc": "#12a37a"},
    {"id": "production", "name": "Production", "icon": "production", "group": "Operations", "acc": "#2e9e3e"},
    {"id": "warehouses", "name": "Warehouses", "icon": "warehouse", "group": "Operations", "acc": "#8a5fd1"},
    {"id": "energy", "name": "Energy Management", "icon": "energy", "group": "Operations", "acc": "#e39a12"},
    {"id": "maintenance", "name": "Maintenance", "icon": "wrench", "group": "Operations", "acc": "#2f7fd1"},
    {"id": "fleet", "name": "Fleet Management", "icon": "truck", "group": "Logistics", "acc": "#1593b8"},
    {"id": "supply", "name": "Supply Chain & Costs", "icon": "route", "group": "Logistics", "acc": "#d1662f"},
    {"id": "locations", "name": "Locations", "icon": "pin", "group": "Logistics", "acc": "#c2417a"},
    {"id": "reports", "name": "Reports", "icon": "report", "group": "Insights", "acc": "#5b6bd1"},
]

NOTES = [
    {"s": "Critical", "t": "Packaging Line 2 - stopped (film jam)", "m": "Maintenance", "r": 0, "pg": "maintenance"},
    {"s": "Warning", "t": "Seasoning sachets below reorder point", "m": "Warehouses", "r": 0, "pg": "warehouses"},
    {"s": "Warning", "t": "Mill 1 energy +14% above hourly baseline", "m": "Energy", "r": 0, "pg": "energy"},
    {"s": "Warning", "t": "Polisher P-03 PM due in 2 days", "m": "Maintenance", "r": 0, "pg": "maintenance"},
    {"s": "Warning", "t": "Truck TR-07 fuel at 18% on the Alexandria route", "m": "Fleet", "r": 0, "pg": "fleet"},
    {"s": "Info", "t": "Pasta Line 1 reached daily target", "m": "Production", "r": 1, "pg": "production"},
    {"s": "Info", "t": "Paddy delivery PO-1182 received", "m": "Supply Chain", "r": 1, "pg": "supply"},
]

# --------------------------------------------------------------------------- overview
MACHINES = [  # name, status, load %, index into maintenance EQUIPMENT (None = not tracked there)
    ["Rice Mill 1", "Running", 94, 0], ["Rice Mill 2", "Running", 88, 1], ["Packaging L1", "Running", 91, None],
    ["Packaging L2", "Fault", 0, 3], ["Pasta Line 1", "Running", 96, 4], ["Polisher P-03", "Idle", 0, 2],
]
WORKFORCE = [["Milling", 52, 54], ["Packaging", 88, 96], ["Pasta", 34, 36], ["Warehouse", 22, 22], ["Maint.", 16, 20]]
TREND = {
    "Daily": {"l": ["06", "08", "10", "12", "14", "16", "18", "20"], "a": [18, 36, 55, 74, 92, 111, 130, 148],
              "t": [20, 40, 60, 80, 100, 120, 140, 160], "u": "t, cumulative by hour", "cum": True},
    "Weekly": {"l": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], "a": [148, 152, 139, 161, 155, 148, 120],
               "t": [155, 155, 155, 155, 155, 155, 120], "u": "t per day", "cum": False},
    "Monthly": {"l": ["W1", "W2", "W3", "W4"], "a": [1010, 1045, 987, 1062], "t": [1050, 1050, 1050, 1050],
                "u": "t per week", "cum": False},
}
HOTSPOTS = [  # zone, left %, top %, page, tab, status, detail lines
    ["Milling", 13, 24, "factories", 0, "warn", "Rice Mill 1 · 94% load", "Rice Mill 2 · 88% load", "Polisher P-03 idle"],
    ["Packaging", 47, 42, "factories", 1, "crit", "L1 and L3 running", "L2 stopped - film jam", "121.5 k packages today"],
    ["Warehouse", 31, 73, "warehouses", 0, "warn", "Capacity used 76%", "3 items below reorder point"],
    ["Energy", 69, 25, "energy", 0, "warn", "42,300 kWh today", "Mill 1 +14% above baseline"],
    ["Maintenance", 76, 63, "maintenance", 0, "warn", "1 fault · WO-3321 open", "Polisher P-03 PM due in 2 days"],
    ["Logistics", 8, 58, "fleet", 0, "warn", "18 trips today", "2 shipments delayed"],
]

# --------------------------------------------------------------------------- locations + routes
LOC_TYPES = {"own": ["#0a9d55", "Own facility"], "port": ["#2f7fd1", "Port / imports"],
             "src": ["#e39a12", "Paddy sourcing"], "hub": ["#8a5fd1", "Distribution hub"]}
# n, site, governorate, role, type, lon, lat, contains, throughput, staff, status, page, tab, road km from Cairo,
# map label side (r = right, l = left, t = above)
SITES = [
    [1, "10th of Ramadan City", "Sharqia", "Main rice mill & pasta plant", "own", 31.75, 30.30,
     "Cleaning, hulling, milling, sorting · Pasta Line P1", "148 t/day", 124, "Running", "factories", 0, 55, "r"],
    [2, "6th of October City", "Giza", "Packaging factory & finished-goods warehouse", "own", 30.93, 29.97,
     "Filling Lines L1-L3 · WH-B · WH-C", "148 t/day packed", 74, "Running", "factories", 1, 32, "l"],
    [3, "Beheira (Damanhur area)", "Beheira", "Paddy collection & raw storage", "own", 30.47, 31.03,
     "Weighbridge · Paddy silos WH-A", "212 t/day intake", 30, "Running", "warehouses", 0, 160, "l"],
    [4, "Alexandria Port", "Alexandria", "Imported film, spares, seasoning", "port", 29.88, 31.19,
     "Customs & inbound imports", "—", "—", "—", "supply", 0, 220, "r"],
    [5, "Kafr El-Sheikh", "Kafr El-Sheikh", "Paddy supplier region", "src", 30.94, 31.11,
     "Supplier farms & collectors", "—", "—", "—", "supply", 0, 140, "t"],
    [6, "Cairo", "Cairo", "Customer deliveries hub", "hub", 31.24, 30.04,
     "Distribution & customers", "—", "—", "—", "supply", 0, 0, "r"],
    [7, "Mansoura", "Dakahlia", "Delta distribution hub - customer deliveries", "hub", 31.38, 31.04,
     "Regional depot · Delta wholesalers & retailers", "≈ 9 t/day delivered", "—", "—", "fleet", 0, 125, "r"],
    [8, "Ain El Sokhna", "Suez", "Red Sea port - imported semolina & packaging inputs", "port", 32.35, 29.67,
     "Sokhna Port · SCZone industrial area", "—", "—", "—", "supply", 0, 130, "l"],
]
# from site, to site, cargo, km, planned trips/day
ROUTES = [[3, 1, "Paddy", 190, 6], [5, 3, "Paddy", 85, 3], [1, 2, "Milled rice", 85, 5], [2, 6, "Finished goods", 32, 8],
          [4, 1, "Imported inputs", 270, 2], [1, 7, "Finished goods", 110, 3]]
RATE_PER_TKM = 1.1  # EGP per ton·km (assumption)

# --------------------------------------------------------------------------- fleet
DIESEL_EGP_PER_L = 17.5  # assumption
TRANSPORT_COST_TODAY = 38900  # EGP - same figure as Overview and Supply Chain
FLEET_COLS = ["id", "type", "cap", "plate", "driver", "status", "route", "load", "fuel", "odo", "service_at",
              "l100", "km", "trips", "harsh", "speeding", "idle", "score", "speed", "note"]
_V = [  # route = index into ROUTES (None = parked). Driver codes only - no personal data.
    ["TR-01", "Trailer", 30, "DLF 1048", "D-01", "On route", 0, 88, 64, 182400, 185000, 38.5, 380, 2, 0, 1, 35, 92, 74, ""],
    ["TR-02", "Trailer", 30, "DLF 1052", "D-02", "On route", 0, 78, 51, 176900, 177600, 39.2, 380, 2, 1, 0, 40, 89, 71, ""],
    ["TR-03", "Trailer", 30, "DLF 1067", "D-03", "Delayed", 0, 100, 12, 201300, 205000, 40.1, 190, 1, 2, 1, 95, 78, 0,
     "Waiting - fuel shortage at depot"],
    ["TR-04", "Truck", 12, "DLF 2210", "D-04", "On route", 1, 85, 72, 98200, 100000, 29.8, 85, 1, 0, 0, 28, 95, 66, ""],
    ["TR-05", "Truck", 12, "DLF 2214", "D-05", "Loading", 2, 40, 80, 112500, 115000, 30.5, 170, 2, 1, 0, 52, 90, 0,
     "Loading at 10th of Ramadan"],
    ["TR-06", "Truck", 12, "DLF 2231", "D-06", "On route", 2, 88, 58, 87600, 88100, 31.0, 170, 2, 2, 2, 30, 81, 78, ""],
    ["TR-07", "Truck", 12, "DLF 2245", "D-07", "On route", 4, 70, 18, 143800, 150000, 30.2, 540, 2, 1, 1, 25, 85, 82,
     "Fuel low - refuel at next station"],
    ["VN-08", "Van", 3.5, "DLF 3301", "D-08", "On route", 3, 70, 66, 64300, 70000, 14.5, 64, 2, 0, 0, 44, 96, 52, ""],
    ["VN-09", "Van", 3.5, "DLF 3305", "D-09", "On route", 3, 74, 45, 71900, 75000, 15.1, 32, 1, 1, 0, 38, 91, 48, ""],
    ["TR-10", "Truck", 12, "DLF 2260", "D-10", "On route", 5, 86, 61, 54100, 60000, 29.5, 110, 1, 0, 1, 33, 90, 69, ""],
    ["VN-11", "Van", 3.5, "DLF 3312", "D-11", "Delayed", 3, 82, 49, 80200, 85000, 15.8, 32, 1, 1, 0, 70, 84, 0,
     "Customer dock queue in Cairo"],
    ["TR-12", "Trailer", 30, "DLF 1071", "D-12", "Idle", None, 0, 88, 150200, 155000, 39.0, 0, 0, 0, 0, 0, 93, 0,
     "Parked at 10th of Ramadan"],
    ["TR-13", "Truck", 12, "DLF 2277", "D-13", "Maintenance", None, 0, 35, 132000, 132000, 31.4, 0, 0, 0, 0, 0, 88, 0,
     "Brake service in workshop"],
    ["VN-14", "Van", 3.5, "DLF 3320", "D-14", "Loading", 3, 30, 77, 41500, 45000, 14.9, 32, 1, 0, 0, 48, 94, 0,
     "Loading at 6th of October"],
]
VEHICLES = [dict(zip(FLEET_COLS, v)) for v in _V]
for _i, _v in enumerate(VEHICLES):
    _v["fuel_l"] = round(_v["km"] * _v["l100"] / 100, 1)
    _v["to_service"] = _v["service_at"] - _v["odo"]
    _v["svc"] = "In workshop" if _v["status"] == "Maintenance" else "Due soon" if _v["to_service"] <= 1000 else "OK"
    # demo motion: a leg of the route takes km × 1.3 s on screen, and each truck starts at its own point
    _v["leg_s"] = (ROUTES[_v["route"]][3] * 1.3) if _v["route"] is not None else 0
    _v["phase"] = round((_i * 0.37) % 1, 2)
    _v["fixed"] = {"Delayed": 0.42 if _v["id"] == "TR-03" else 0.97, "Loading": 0.03}.get(_v["status"])


def fleet_summary():
    v = VEHICLES
    moving = [x for x in v if x["status"] in ("On route", "Delayed")]
    dispatched = [x for x in v if x["status"] in ("On route", "Delayed", "Loading")]
    trips = sum(x["trips"] for x in v)
    delayed = sum(1 for x in v if x["status"] == "Delayed")
    km = sum(x["km"] for x in v)
    fuel = sum(x["fuel_l"] for x in v)
    util = sum(x["load"] * x["cap"] for x in dispatched) / sum(x["cap"] for x in dispatched)
    fuel_cost = fuel * DIESEL_EGP_PER_L
    rest = TRANSPORT_COST_TODAY - fuel_cost
    costs = [["Diesel", round(fuel_cost)], ["Driver wages", round(rest * .45)], ["Tolls & fees", round(rest * .15)],
             ["Tyres & upkeep", round(rest * .20)]]
    costs.append(["Hired hauliers", TRANSPORT_COST_TODAY - sum(c[1] for c in costs)])
    active = [x for x in v if x["status"] != "Maintenance"]
    return {
        "size": len(v), "moving": len(moving), "dispatched": len(dispatched), "trips": trips, "delayed": delayed,
        "on_time": (trips - delayed) / trips * 100, "util": util, "km": km, "fuel": fuel, "l100": fuel / km * 100,
        "cost_km": TRANSPORT_COST_TODAY / km, "costs": costs,
        "harsh": sum(x["harsh"] for x in v), "speeding": sum(x["speeding"] for x in v),
        "idle": sum(x["idle"] for x in dispatched) / len(dispatched),
        "score": sum(x["score"] for x in active) / len(active),
        "due": sum(1 for x in v if x["svc"] == "Due soon"), "shop": sum(1 for x in v if x["svc"] == "In workshop"),
        "status": {s: sum(1 for x in v if x["status"] == s) for s in ["On route", "Loading", "Delayed", "Idle", "Maintenance"]},
    }


# --------------------------------------------------------------------------- maintenance + costs + reports
# id, name, status, MTBF h, MTTR h, next PM, YTD cost EGP, lost contribution EGP/h, downtime h today, direct cost EGP
EQUIPMENT = [["M-101", "Rice Mill 1", "Running", 1450, 3.2, "in 6 d", 18400, 6500, 0, 0],
             ["M-102", "Rice Mill 2", "Running", 1320, 2.8, "in 11 d", 15200, 6000, 0, 0],
             ["P-03", "Polisher P-03", "Idle", 980, 4.0, "in 2 d", 22100, 3800, 1.4, 600],
             ["PK-L2", "Packaging Line 2", "Fault", 620, 4.5, "in 3 d", 31800, 4200, 2.1, 1500],
             ["PS-1", "Pasta Line 1", "Running", 1100, 2.5, "in 9 d", 9800, 3000, 0, 0],
             ["CV-5", "Conveyor CV-5", "Under Maintenance", 800, 1.5, "today", 5200, 1500, 0.5, 200]]
# driver, actual EGP/t, budget EGP/t, imported share, local-price share, fuel share
COSTS = [["Raw materials", 21400, 20900, .10, .90, 0], ["Packaging", 2350, 2300, .55, .45, 0],
         ["Energy & water", 430, 400, 0, 0, 0], ["Labor", 980, 980, 0, 0, 0],
         ["Maintenance & spares", 310, 280, .70, .30, 0], ["Transport", 263, 240, 0, 0, .35],
         ["Storage & handling", 190, 190, 0, 0, 0], ["Waste & reprocessing", 140, 110, 0, 0, 0]]


def reports():
    f = fleet_summary()
    return [
        ["Daily production", "Daily", [["Production", "148 t"], ["Target", "160 t"], ["Achievement", "92.5%"]]],
        ["Weekly operations", "Weekly", [["OEE", "78.4%"], ["Downtime", "2.1 h/day"]]],
        ["Monthly summary", "Monthly", [["Output", "4,104 t"], ["Cost/t", "26,063 EGP"]]],
        ["Inventory", "Daily", [["Below reorder", "3"], ["Capacity used", "76%"]]],
        ["Maintenance", "Weekly", [["Open WOs", "3"], ["Faults", "1"]]],
        ["Energy", "Daily", [["kWh", "42,300"], ["kWh/t", "286"]]],
        ["Fleet", "Daily", [["Trips", str(f["trips"])], ["On-time", f"{f['on_time']:.0f}%"],
                            ["Diesel", f"{fmt(f['fuel'])} L"], ["Consumption", f"{f['l100']:.1f} L/100 km"]]],
        ["Transport & cost", "Weekly", [["Cost/t", "263 EGP"]]],
        ["Quality", "Daily", [["Rejection", "1.1%"]]],
        ["Workforce", "Daily", [["Present", "212/228"]]],
        ["Exchange-rate impact", "Monthly", [["Scenario", "+10%"]]],
    ]


# --------------------------------------------------------------------------- page data
def build_config():
    f = fleet_summary()
    faults = sum(1 for m in MACHINES if m[1] == "Fault")
    idle = sum(1 for m in MACHINES if m[1] == "Idle")
    eq_down_cost = sum(e[8] * e[7] + e[9] for e in EQUIPMENT)
    cost_a = sum(c[1] for c in COSTS)
    cost_b = sum(c[2] for c in COSTS)
    own = [s for s in SITES if s[4] == "own"]
    longest = max(ROUTES, key=lambda r: r[3])
    site = {s[0]: s[1] for s in SITES}

    pages = {
        "overview": {
            "production": {"actual": 148, "target": 160, "rice": 143, "pasta": 5.0},
            "oee": {"v": 78.4, "a": 91, "p": 89, "q": 96.8},
            "kpis": [
                kpi("Active lines", f"{len(MACHINES) - faults} / {len(MACHINES)}", f"{faults} fault, {idle} idle", "dn", "layers",
                    {"t": "lines"}, ["factories", 0]),
                kpi("Availability", "91.2%", "Downtime 2.1 h today", "dn", "clock",
                    {"t": "bar", "p": 91.2, "c": "var(--info)"}, ["maintenance", 0]),
                kpi("Inventory alerts", "3", "items below reorder point", "dn", "alert",
                    {"t": "chips", "d": ["Seasoning sachets", "Cartons", "Semolina"]}, ["warehouses", 0]),
                kpi("Energy", "42,300 kWh", "EGP 63,450 · 286 kWh/t", "", "energy",
                    {"t": "spark", "d": [41, 43, 40, 44, 42, 41, 42.3], "c": "var(--warn)",
                     "cap": "Last 7 days, thousand kWh"}, ["energy", 0]),
                kpi("Transport + operating", "EGP 38,900", "EGP 262/t", "", "truck",
                    {"t": "pair", "d": [[str(f["trips"]), "trips today", ""], [str(f["delayed"]), "delayed", "dn"]]},
                    ["fleet", 0]),
                kpi("Rice waste / recovery", "4.2% / 61%", "recovered ÷ eligible material", "up", "leaf",
                    {"t": "split", "d": [["Waste", 4.2, 10, "var(--crit)"], ["Recovery", 61, 100, "var(--brand)"]]},
                    ["production", 0]),
            ],
            "hotspots": HOTSPOTS, "workforce": WORKFORCE,
        },
        "factories": {
            "tabs": ["Main Production", "Packaging", "Quality & Safety", "Workforce", "Site Plan", "Filling Locations",
                     "Storage Locations"],
            "main": {
                "kpis": [kpi("Paddy intake", "212 t", "today", "", "box"),
                         kpi("Yield", "67.5%", "143 t accepted ÷ 212 t paddy", "", "gauge", {"t": "ring", "p": 67.5}),
                         kpi("Bottleneck", "Polishing", "Polisher P-03 idle", "dn", "alert", None, ["maintenance", 0]),
                         kpi("Process losses", "69 t", "husk, bran, broken, dust", "", "leaf")],
                "stages": [["Intake", 212], ["Cleaning", 208], ["Hulling", 160], ["Milling", 150], ["Polishing", 148],
                           ["Sorting", 143]],
                "table": [["Cleaning", 212, 208, "@Running"], ["Hulling", 208, 160, "@Running"],
                          ["Milling", 160, 150, "@Running"], ["Polishing", 150, 148, "@Idle"],
                          ["Grading & sorting", 148, 143, "@Running"]],
            },
            "packaging": {
                "kpis": [kpi("Packages today", "121.5 k", "rice + pasta", "", "box"),
                         kpi("Rejected", "0.9%", "rejected ÷ produced", "", "check", {"t": "ring", "p": 99.1, "lbl": "pass"}),
                         kpi("Stoppages", "3", "Line 2 fault 2.1 h", "dn", "alert", None, ["maintenance", 0]),
                         kpi("Avg changeover", "24 min", "per product change", "", "clock")],
                "types": [["Rice 1 kg", 48.2], ["Rice 5 kg", 9.4], ["Rice 10 kg", 3.1], ["Pasta packet", 60.8]],
                "lines": [["L1", "Rice 1 kg", 120, "0.8", "@Running"], ["L2", "Rice 5 kg", "—", "—", "@Fault"],
                          ["L3", "Rice 10 kg", 30, "0.6", "@Running"], ["P1", "Seasoned pasta pkt", 210, "1.2", "@Running"]],
            },
            "quality": {
                "kpis": [kpi("Rejection rate", "1.1%", "rejected ÷ inspected", "", "shield", {"t": "ring", "p": 98.9, "lbl": "pass"}),
                         kpi("Open nonconformities", "4", "2 packaging, 2 raw", "dn", "alert",
                             {"t": "chips", "d": ["2 packaging", "2 raw material"]}),
                         kpi("Hygiene checks", "36 / 36", "completed today", "up", "check", {"t": "bar", "p": 100, "c": "var(--brand)"}),
                         kpi("Batches on hold", "1", "B-RC-2610-07", "dn", "box")],
                "batches": [["B-RC-2610-07", "Rice 1 kg", "Finished", "@Hold", "Moisture 14.8%", "Re-dry & retest"],
                            ["B-PS-2610-03", "Pasta Tomato", "In-process", "@Pass", "—", "—"],
                            ["B-PD-2610-11", "Paddy lot PD-88", "Intake", "@Pass", "—", "—"],
                            ["B-PK-2610-02", "Rice 5 kg", "Packaging", "@Watch", "2 seal defects", "Adjust sealer"]],
                "trace": ["Intake", "Cleaning", "Hulling", "Milling", "Polishing", "Sorting", "Packaging", "QC hold"],
            },
            "workforce": {
                "kpis": [kpi("Workforce", "228", "total", "", "users"),
                         kpi("Present", "212", "93% attendance", "", "check", {"t": "ring", "p": 93}),
                         kpi("Overtime", "46 h", "today", "", "clock"),
                         kpi("Output / labor hour", "87 kg/h", "148 t ÷ 1,696 h", "", "gauge")],
                "areas": WORKFORCE,
                "impact": "Packaging is 8 short and Maintenance 4 short. The Packaging shortage can slow the Line 2 "
                          "restart after the fault.",
            },
            "plan": {
                "types": {"in": ["#2f7fd1", "Intake & dispatch"], "pr": ["#0a9d55", "Production"],
                          "fl": ["#e39a12", "Filling & packaging"], "st": ["#8a5fd1", "Storage"], "su": ["#7b8791", "Support"]},
                # n, name (| = line break), sub, type, x, y, w, h, page, tab, status, function
                "zones": [[1, "Gate &|Weighbridge", "Paddy trucks in", "in", 20, 190, 95, 120, "fleet", 0, "ok", "Truck weighing, sampling and paddy intake"],
                          [2, "Paddy Silos", "WH-A raw storage", "st", 130, 30, 140, 120, "warehouses", 0, "ok", "Paddy storage in silos (WH-A)"],
                          [3, "Cleaning &|Hulling", "Stages 1-2", "pr", 290, 30, 130, 120, "factories", 0, "ok", "Paddy cleaning, destoning and hulling"],
                          [4, "Milling &|Polishing", "Mills 1-2 · P-03", "pr", 440, 30, 150, 120, "factories", 0, "warn", "Whitening, polishing - Polisher P-03 idle"],
                          [5, "Grading &|Sorting", "Optical sorters", "pr", 610, 30, 120, 120, "factories", 0, "ok", "Length grading, colour sorting, head-rice split"],
                          [14, "Quality Lab", "Batch release", "su", 750, 30, 120, 120, "factories", 2, "ok", "Inspection, moisture, batch release"],
                          [15, "Offices", "Admin · control room", "su", 890, 30, 90, 120, "overview", 0, "ok", "Management and control room"],
                          [8, "Ingredients &|Seasoning Store", "Semolina · sachets", "st", 250, 190, 170, 120, "warehouses", 0, "bad", "Semolina, seasoning mixes and sachets - sachets low"],
                          [6, "Rice Filling &|Packaging Hall", "Lines L1 · L2 · L3", "fl", 440, 190, 220, 120, "factories", 1, "bad", "Rice filling and bagging 1/5/10 kg - Line 2 fault"],
                          [7, "Pasta Plant &|Seasoning Filling", "Line P1", "fl", 690, 190, 190, 120, "production", 1, "ok", "Pasta production and seasoned packet filling"],
                          [12, "Utilities &|Substation", "Power · boiler", "su", 130, 350, 110, 120, "energy", 0, "ok", "Electrical substation, boiler, compressors, water"],
                          [13, "Maintenance|Workshop", "Spare parts", "su", 255, 350, 120, 120, "maintenance", 0, "ok", "Workshop and spare-parts store"],
                          [9, "Packaging|Materials Store", "WH-C", "st", 390, 350, 130, 120, "warehouses", 0, "warn", "Bags, film, cartons, labels - cartons low"],
                          [10, "Finished Goods|Warehouse", "WH-B rice + pasta", "st", 540, 350, 180, 120, "warehouses", 0, "ok", "Finished rice and pasta pallets (WH-B)"],
                          [11, "Dispatch|Docks", "Loading bays 1-4", "in", 740, 350, 140, 120, "fleet", 0, "ok", "Outbound loading and delivery"]],
                "arrows": ["67,190 67,90 130,90", "270,90 290,90", "420,90 440,90", "590,90 610,90",
                           "640,150 640,170 550,170 550,190", "335,310 335,330 780,330 780,310", "455,350 455,310",
                           "600,310 600,350", "705,310 705,350", "720,410 740,410"],
            },
            "filling": {
                "kpis": [kpi("Filling stations", "4", "L1-L3 rice · P1 pasta", "", "layers"),
                         kpi("Active", "3 / 4", "L2 faulted", "dn", "alert", {"t": "bar", "p": 75, "c": "var(--warn)"}),
                         kpi("Packages today", "121.5 k", "rice 60.7 k + pasta 60.8 k", "", "box"),
                         kpi("Rejected", "0.9%", "rejected ÷ produced", "", "check")],
                "lines": [["L1 Rice 1 kg", 48.2], ["L2 Rice 5 kg", 9.4], ["L3 Rice 10 kg", 3.1], ["P1 Pasta", 60.8]],
                "stations": [["Zone 6 - Bay 1", "L1", "Rice 1 kg bags", 120, "0.8", "22 min", "@Running"],
                             ["Zone 6 - Bay 2", "L2", "Rice 5 kg bags", "—", "—", "—", "@Fault"],
                             ["Zone 6 - Bay 3", "L3", "Rice 10 kg bags", 30, "0.6", "25 min", "@Running"],
                             ["Zone 7 - Pasta plant", "P1", "Seasoned pasta packets", 210, "1.2", "26 min", "@Running"]],
                "feed": [["Film & bags", "WH-C Packaging store", "Zone 9 → 6", "@Watch"],
                         ["Cartons", "WH-C Packaging store", "Zone 9 → 6", "@Low"],
                         ["Seasoning sachets", "Seasoning store", "Zone 8 → 7", "@Low"],
                         ["Finished output", "WH-B Finished goods", "Zone 6/7 → 10", "@OK"]],
            },
            "storage": {
                "kpis": [kpi("Capacity used", "76%", "4 storage zones", "", "warehouse", {"t": "bar", "p": 76, "c": "var(--acc)"}),
                         kpi("Below reorder", "3", "sachets, cartons, semolina", "dn", "alert"),
                         kpi("Oldest finished stock", "41 days", "WH-B", "", "calendar"),
                         kpi("Free pallet positions", "243", "of 780", "", "layers", {"t": "bar", "p": 243 / 780 * 100, "c": "var(--info)"})],
                "zones": [["2 · Silos", 82], ["8 · Ingredients", 68], ["9 · Packaging", 64], ["10 · Finished", 71]],
                "aging": {"l": ["0-30 d", "31-90 d", "> 90 d"], "rice": [150, 52, 8], "pasta": [6, 2, 0]},
                "table": [["2", "WH-A Silos S1-S6", "Paddy", "780 t", "82%", "640 t", "@OK"],
                          ["8", "Racks R1-R4", "Semolina, seasoning, sachets", "120 pallets", "68%", "82 pallets", "@Low"],
                          ["9", "WH-C Aisles 1-3", "Bags, film, cartons, labels", "200 pallets", "64%", "128 pallets", "@Watch"],
                          ["10", "WH-B Bays B1-B8", "Finished rice & pasta", "460 pallets", "71%", "327 pallets", "@OK"]],
            },
        },
        "production": {
            "tabs": ["Rice", "Pasta"],
            "rice": {
                "input": 212, "finished": 143, "waste": 8.9, "eligible": 6.2, "recovered": 3.8,
                "grades": [["Short-grain", 82], ["Medium-grain", 38], ["Long-grain", 23]],
                "quality": [["B-RC-2610-07", "Rice 1 kg", "@Hold", "Moisture 14.8%"], ["B-RC-2610-05", "Rice 5 kg", "@Pass", "—"],
                            ["B-RC-2610-04", "Rice 10 kg", "@Pass", "—"]],
            },
            "pasta": {
                "kpis": [kpi("Pasta output", "5.0 t", "target 5.5 t", "dn", "production", {"t": "bar", "p": 5 / 5.5 * 100, "c": "var(--warn)"}),
                         kpi("Packets", "60.8 k", "seasoned packets", "", "box"),
                         kpi("New-capacity use", "71%", "of installed line capacity", "", "gauge", {"t": "ring", "p": 71}),
                         kpi("Rejects", "1.2%", "packets", "", "alert")],
                "flavors": {"l": ["Tomato", "Chicken", "Cheese", "Spicy"], "a": [21, 17, 13, 9.8], "t": [22, 18, 14, 10]},
                "ingredients": [["Semolina", "85 t", "@Watch"], ["Seasoning mix - Tomato", "1.4 t", "@OK"],
                                ["Seasoning sachets", "380 k", "@Low"], ["Pasta packaging film", "2.1 t", "@OK"]],
                "batches": [["B-PS-2610-03", "Tomato", "21,000", "@Pass"], ["B-PS-2610-04", "Chicken", "17,000", "@Pass"],
                            ["B-PS-2610-05", "Spicy", "9,800", "@Pending"]],
            },
        },
        "warehouses": {
            "kpis": [kpi("Capacity used", "76%", "all warehouses", "", "warehouse", {"t": "ring", "p": 76}),
                     kpi("Below reorder", "3", "sachets, cartons, semolina", "dn", "alert",
                         {"t": "chips", "d": ["Sachets", "Cartons", "Semolina"]}),
                     kpi("Inbound today", "4", "shipments", "", "truck", None, ["fleet", 0]),
                     kpi("Outbound today", "6", "shipments", "", "route", None, ["fleet", 0])],
            "tanks": [["WH-A Raw", 82, "Paddy · 640 t on hand"], ["WH-B Finished", 71, "Rice & pasta · 327 pallets"],
                      ["WH-C Packaging", 64, "Bags, film, cartons · 128 pallets"]],
            "shipments": [["IN-118", "Paddy", "30 t", "@In transit"], ["IN-119", "Paddy", "28 t", "@Delayed"],
                          ["OUT-77", "Rice 1 kg", "22 t", "@On time"], ["OUT-78", "Pasta", "9 t", "@Delayed"]],
            "stock": [["Paddy rice", "640 t", "120 t", "520 t", "300 t", "@OK", "PD-88", 520 / 300],
                      ["Finished rice", "210 t", "95 t", "115 t", "80 t", "@OK", "RC-2610 / 18 mo", 115 / 80],
                      ["Semolina", "85 t", "30 t", "55 t", "60 t", "@Watch", "SM-41 / 6 mo", 55 / 60],
                      ["Seasoning sachets", "380 k", "150 k", "230 k", "500 k", "@Low", "SS-12 / 9 mo", 230 / 500],
                      ["Cartons", "4.1 k", "1.2 k", "2.9 k", "5 k", "@Low", "—", 2.9 / 5],
                      ["Spare parts - bearings", "36", "4", "32", "20", "@OK", "—", 32 / 20]],
        },
        "energy": {
            "kpis": [kpi("Electricity", "42,300 kWh", "EGP 63,450 @ 1.50/kWh", "", "energy",
                         {"t": "spark", "d": [41, 43, 40, 44, 42, 41, 42.3], "c": "var(--acc)", "cap": "Last 7 days, thousand kWh"}),
                     kpi("Energy intensity", "286 kWh/t", "target 270", "dn", "gauge"),
                     kpi("Water", "310 m³", "2.1 m³/t", "", "drop"),
                     kpi("Fuel", "640 L", "boilers, forklifts", "", "fuel")],
            "areas": [["Milling", 17.8], ["Packaging", 8.4], ["Pasta", 6.9], ["Warehouses", 3.5], ["Utilities", 5.7]],
            "week": {"l": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], "a": [41, 43, 40, 44, 42, 41, 42.3], "t": 40},
            "intensity": {"v": 286, "t": 270, "max": 360},
            "anomalies": [["11:20", "Mill 1", "+14% vs baseline", "@Watch"], ["14:05", "Compressor", "Idle load high", "@Watch"]],
            "savings": [["Shut Packaging L2 auxiliaries while it is faulted", "≈ 380 kWh/day"],
                        ["Move polishing out of the 18:00-21:00 peak", "peak tariff avoided"],
                        ["Fix compressed-air leaks (idle load)", "≈ 6% of compressor kWh"]],
        },
        "maintenance": {
            "tabs": ["Equipment", "Work orders", "Calendar"],
            "kpis": [kpi("Running", "3 / 6", "machines", "up", "check", {"t": "bar", "p": 50, "c": "var(--brand)"}),
                     kpi("Faults", "1", "PK-L2", "dn", "alert"),
                     kpi("Downtime today", "4.0 h", "est. EGP " + fmt(eq_down_cost), "dn", "clock"),
                     kpi("MTBF / MTTR", "~1,050 h / 3.1 h", "equipment average", "", "gauge")],
            "equipment": EQUIPMENT,
            "orders": [["WO-3321", "PK-L2", "Corrective - film jam", "@Critical", "@Open", 6],
                       ["WO-3318", "P-03", "Preventive", "Normal", "@Planned", 4],
                       ["WO-3312", "CV-5", "Corrective - belt", "Normal", "@Open", 3],
                       ["WO-3299", "M-101", "Preventive", "Normal", "@Done", 5]],
            "spares": [["Bearings", 32, 20], ["Belts", 6, 4], ["Seals", 14, 8], ["Sealer jaws", 1, 2]],
            "calendar": {"2": "P-03 PM", "3": "L2 follow-up", "6": "Mill 1 PM", "9": "Pasta L1 PM", "11": "Mill 2 PM"},
        },
        "fleet": {
            "tabs": ["Live Map", "Vehicles", "Fuel & Costs", "Service & Safety"],
            "vehicles": VEHICLES, "sum": f, "diesel_price": DIESEL_EGP_PER_L, "transport_cost": TRANSPORT_COST_TODAY,
            "live_kpis": [
                kpi("Fleet size", str(f["size"]), "trailers, trucks and vans", "", "truck",
                    {"t": "pair", "d": [[str(sum(1 for v in VEHICLES if v["type"] == t)), t.lower() + "s", ""] for t in ("Trailer", "Truck", "Van")]}),
                kpi("On the road", f"{f['moving']} / {f['size']}", f"{f['status']['Loading']} loading · "
                    f"{f['status']['Idle']} idle · {f['status']['Maintenance']} in workshop", "", "route",
                    {"t": "bar", "p": f["moving"] / f["size"] * 100, "c": "var(--acc)"}),
                kpi("Vehicle utilization", f"{f['util']:.0f}%", "load ÷ capacity, dispatched vehicles", "", "gauge",
                    {"t": "ring", "p": round(f["util"], 1)}),
                kpi("On-time deliveries", f"{f['on_time']:.0f}%", f"{f['trips'] - f['delayed']} of {f['trips']} trips",
                    "", "check", {"t": "bar", "p": f["on_time"], "c": "var(--brand)"}),
                kpi("Trips today", str(f["trips"]), "7 inbound · 11 outbound", "", "box", None, ["supply", 0]),
                kpi("Delayed", str(f["delayed"]), "fuel at depot, dock queue", "dn", "alert",
                    {"t": "chips", "d": ["TR-03 depot", "VN-11 dock queue"]}),
            ],
            "fuel_kpis": [
                kpi("Diesel today", f"{fmt(f['fuel'])} L", f"EGP {fmt(f['fuel'] * DIESEL_EGP_PER_L)} @ {DIESEL_EGP_PER_L}/L",
                    "", "fuel"),
                kpi("Avg consumption", f"{f['l100']:.1f} L/100 km", "fleet mix, target 32", "dn" if f["l100"] > 32 else "up",
                    "gauge"),
                kpi("Distance today", f"{fmt(f['km'])} km", f"{f['trips']} trips", "", "route"),
                kpi("Cost per km", f"EGP {f['cost_km']:.1f}", f"EGP {fmt(TRANSPORT_COST_TODAY)} ÷ {fmt(f['km'])} km", "",
                    "coin"),
            ],
            "safety_kpis": [
                kpi("Safety score", f"{f['score']:.0f} / 100", "average of active drivers", "up", "shield",
                    {"t": "ring", "p": round(f["score"], 1)}),
                kpi("Harsh braking", str(f["harsh"]), "events today", "dn", "alert"),
                kpi("Speeding", str(f["speeding"]), "events over 90 km/h", "dn", "gauge"),
                kpi("Avg idle time", f"{f['idle']:.0f} min", "per dispatched vehicle", "", "clock"),
                kpi("Service due", str(f["due"]), "within 1,000 km", "dn", "wrench",
                    {"t": "chips", "d": [v["id"] for v in VEHICLES if v["svc"] == "Due soon"]}),
                kpi("In workshop", str(f["shop"]), "TR-13 brake service", "", "wrench", None, ["maintenance", 1]),
            ],
        },
        "supply": {
            "tabs": ["Logistics", "Costs", "Exchange rate"],
            "kpis": [kpi("Trips today", str(f["trips"]), "7 in · 11 out", "", "truck", None, ["fleet", 0]),
                     kpi("Transport cost", "EGP 38,900", "EGP 263/t finished", "", "coin", None, ["fleet", 2]),
                     kpi("Delayed", str(f["delayed"]), "fuel at depot, dock queue", "dn", "alert", None, ["fleet", 0]),
                     kpi("Vehicle utilization", f"{f['util']:.0f}%", "load ÷ capacity", "", "gauge",
                         {"t": "ring", "p": round(f["util"], 1)}, ["fleet", 0])],
            "shipments": [["SH-1", "Inbound paddy", 28, 7800, "@In transit", "—"],
                          ["SH-2", "Inbound paddy", 30, 8100, "@Delayed", "Fuel shortage at depot"],
                          ["SH-3", "Outbound rice", 22, 6900, "@On time", "—"],
                          ["SH-4", "WH → Packaging", 12, 2100, "@On time", "—"],
                          ["SH-5", "Outbound pasta", 9, 3400, "@Delayed", "Customer dock queue"]],
            "suppliers": [["Supplier A", 94], ["Supplier B", 81], ["Supplier C", 97]],
            "costs": COSTS, "cost_a": cost_a, "cost_b": cost_b, "usd_egp": 48.50,
        },
        "locations": {
            "tabs": ["Map & Sites", "Routes"], "types": LOC_TYPES, "sites": SITES, "routes": ROUTES, "rate": RATE_PER_TKM,
            "kpis": [kpi("Own facilities", str(len(own)), " · ".join(s[1].replace(" City", "").split(" (")[0] for s in own), "", "factory"),
                     kpi("Total staff", str(sum(s[9] for s in own)), f"across {len(own)} sites", "", "users"),
                     kpi("Related hubs", str(len(SITES) - len(own)), "2 ports, paddy region, Cairo, Mansoura", "", "pin"),
                     kpi("Longest route", f"{longest[3]} km", f"{site[longest[0]]} → {site[longest[1]]}", "", "route")],
        },
        "reports": {"list": reports()},
    }
    badges = {"maintenance": [faults, "crit"], "warehouses": [3, "warn"], "fleet": [f["delayed"], "warn"],
              "energy": [1, "warn"]}
    return {"pages": PAGES, "notes": NOTES, "machines": MACHINES, "trend": TREND, "badges": badges, "data": pages,
            "generated": datetime.now().isoformat(timespec="seconds")}


# --------------------------------------------------------------------------- live readings (simulated)
LIVE_LOCK = threading.Lock()
LIVE = {"seq": 0, "power": [], "loads": {}, "veh": {}}


def live_tick():
    """Advance the simulated readings by one step (every 3 s)."""
    with LIVE_LOCK:
        LIVE["seq"] += 1
        hour = datetime.now().hour + datetime.now().minute / 60
        base = 1780 + 160 * math.sin((hour - 9) / 24 * 2 * math.pi)
        LIVE["power"] = (LIVE["power"] + [round(base + random.uniform(-70, 70))])[-40:]
        for name, status, load, _ in MACHINES:
            LIVE["loads"][name] = 0 if status != "Running" else max(60, min(100, load + random.randint(-3, 2)))
        for v in VEHICLES:
            st = LIVE["veh"].setdefault(v["id"], {"fuel": float(v["fuel"])})
            moving = v["status"] == "On route"
            st["speed"] = round(max(0, v["speed"] + random.uniform(-6, 6))) if moving else 0
            if moving:
                st["fuel"] = max(3.0, st["fuel"] - random.uniform(0.0, 0.04))
        return snapshot()


def snapshot():
    return {"seq": LIVE["seq"], "now": time.time(), "power": LIVE["power"], "loads": LIVE["loads"],
            "veh": {k: {"speed": v["speed"], "fuel": round(v["fuel"], 1)} for k, v in LIVE["veh"].items()}}


def live_loop():
    while True:
        time.sleep(3)
        live_tick()


# --------------------------------------------------------------------------- reports (PDF / CSV)
def _pdf_text(s):
    for a, b in {"–": "-", "—": "-", "→": "->", "≈": "~", "’": "'"}.items():
        s = s.replace(a, b)
    s = s.encode("latin-1", "replace").decode("latin-1")
    return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


_LOGOS = {}


def load_png(path):
    """Decode an 8-bit RGB/RGBA PNG into (width, height, rgb bytes, alpha bytes or None) with zlib only."""
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"{path.name} is not a PNG")
    pos, idat, ihdr = 8, bytearray(), None
    while pos < len(data):
        length, kind = struct.unpack(">I4s", data[pos:pos + 8])
        chunk = data[pos + 8:pos + 8 + length]
        pos += 12 + length
        if kind == b"IHDR":
            ihdr = struct.unpack(">IIBBBBB", chunk)
        elif kind == b"IDAT":
            idat += chunk
        elif kind == b"IEND":
            break
    w, h, depth, ctype, _, _, interlace = ihdr
    if depth != 8 or ctype not in (2, 6) or interlace:
        raise ValueError(f"{path.name}: only 8-bit, non-interlaced RGB/RGBA PNGs are supported")
    bpp = 4 if ctype == 6 else 3
    stride, raw = w * bpp, zlib.decompress(bytes(idat))
    out, prev, i = bytearray(), bytearray(stride), 0
    for _ in range(h):
        f, line = raw[i], bytearray(raw[i + 1:i + 1 + stride])
        i += 1 + stride
        for x in range(stride):
            a = line[x - bpp] if x >= bpp else 0
            if f == 1:
                line[x] = (line[x] + a) & 255
            elif f == 2:
                line[x] = (line[x] + prev[x]) & 255
            elif f == 3:
                line[x] = (line[x] + ((a + prev[x]) >> 1)) & 255
            elif f == 4:
                b, c = prev[x], (prev[x - bpp] if x >= bpp else 0)
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                line[x] = (line[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        out += line
        prev = line
    if bpp == 3:
        return w, h, bytes(out), None
    rgb = bytearray(w * h * 3)
    rgb[0::3], rgb[1::3], rgb[2::3] = out[0::4], out[1::4], out[2::4]
    return w, h, bytes(rgb), bytes(out[3::4])


def logos():
    """Schneider Electric and AVEVA logos for the PDF, decoded once and cached."""
    if not _LOGOS:
        for key in ("schneider", "aveva"):
            try:
                _LOGOS[key] = load_png(STATIC / "images" / f"{key}.png")
            except (OSError, ValueError, TypeError, zlib.error) as exc:
                print(f"PDF logo skipped ({key}): {exc}")
                _LOGOS[key] = None
    return _LOGOS


def make_pdf(title, period, rows):
    """A one-page A4 PDF written by hand: standard Type 1 fonts plus the two vendor logos as images."""
    T = _pdf_text
    stamp = datetime.now().strftime("%d %b %Y %H:%M")
    # Logo image objects (each with a soft mask for transparency) are numbered from 7, after the fixed objects.
    images, extra, num = [], [], 7
    x_right = 555
    for key in ("aveva", "schneider"):  # laid out right to left
        img = logos().get(key)
        if not img:
            continue
        w, h, rgb, alpha = img
        dh = 26
        dw = dh * w / h
        x_right -= dw
        smask = ""
        if alpha is not None:
            a = zlib.compress(alpha)
            extra.append((num + 1, b"<< /Type /XObject /Subtype /Image /Width %d /Height %d /ColorSpace /DeviceGray "
                          b"/BitsPerComponent 8 /Filter /FlateDecode /Length %d >>\nstream\n" % (w, h, len(a))
                          + a + b"\nendstream"))
            smask = f" /SMask {num + 1} 0 R"
        c = zlib.compress(rgb)
        extra.append((num, (f"<< /Type /XObject /Subtype /Image /Width {w} /Height {h} /ColorSpace /DeviceRGB "
                            f"/BitsPerComponent 8 /Filter /FlateDecode{smask} /Length {len(c)} >>\nstream\n").encode()
                      + c + b"\nendstream"))
        images.append((f"Im{key}", num, x_right, dw, dh))
        num += 2 if alpha is not None else 1
        x_right -= 26  # gap that holds the divider
    ops = [f"q {dw:.2f} 0 0 {dh} {x:.2f} 792 cm /{name} Do Q" for name, _, x, dw, dh in images]
    if len(images) == 2:
        div = images[0][2] - 13
        ops.append(f"0.8 0.83 0.82 RG 1 w {div:.1f} 790 m {div:.1f} 820 l S")
    ops += ["BT /F2 17 Tf 0.09 0.13 0.12 rg 40 808 Td (" + T("Al Doha Food Industries") + ") Tj ET",
            "BT /F1 10 Tf 0.42 0.47 0.5 rg 40 793 Td (" + T("Plant operations dashboard") + ") Tj ET",
            "0.04 0.62 0.33 rg 0 772 595 4 re f",
            "BT /F2 10 Tf 0.04 0.62 0.33 rg 40 742 Td (" + T(f"{period.upper()} REPORT") + ") Tj ET",
            "BT /F2 24 Tf 0.09 0.13 0.12 rg 40 714 Td (" + T(title) + ") Tj ET",
            "BT /F1 10 Tf 0.42 0.47 0.5 rg 40 696 Td (" + T(f"Generated {stamp}  |  DEMO DATA") + ") Tj ET",
            "0.09 0.13 0.12 rg 40 654 515 26 re f",
            "BT /F2 10 Tf 1 1 1 rg 52 663 Td (METRIC) Tj ET", "BT /F2 10 Tf 1 1 1 rg 330 663 Td (VALUE) Tj ET"]
    y = 630
    for i, (k, v) in enumerate(rows):
        if i % 2 == 0:
            ops.append(f"0.95 0.965 0.958 rg 40 {y - 9} 515 28 re f")
        ops.append(f"BT /F1 12 Tf 0.09 0.13 0.12 rg 52 {y} Td ({T(k)}) Tj ET")
        ops.append(f"BT /F2 12 Tf 0.09 0.13 0.12 rg 330 {y} Td ({T(v)}) Tj ET")
        y -= 28
    ops += ["0.88 0.9 0.89 RG 0.8 w 40 58 m 555 58 l S",
            "BT /F1 8 Tf 0.42 0.47 0.5 rg 40 44 Td (" + T("Sample values for demonstration - not live plant data.")
            + ") Tj ET",
            "BT /F1 8 Tf 0.42 0.47 0.5 rg 510 44 Td (" + T("Page 1 of 1") + ") Tj ET"]
    content = zlib.compress("\n".join(ops).encode("latin-1"))
    xobj = " ".join(f"/{name} {n} 0 R" for name, n, *_ in images)
    objs = [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            ("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> "
             f"/XObject << {xobj} >> >> /Contents 6 0 R >>").encode(),
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
            b"<< /Length %d /Filter /FlateDecode >>\nstream\n" % len(content) + content + b"\nendstream"]
    objs += [body for _, body in sorted(extra)]
    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = []
    for i, o in enumerate(objs, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + o + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1)
    out += b"".join(b"%010d 00000 n \n" % o for o in offsets)
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref)
    return bytes(out)


def make_csv(rows):
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Metric", "Value"])
    w.writerows(rows)
    return buf.getvalue().encode("utf-8-sig")


# --------------------------------------------------------------------------- HTTP
TEXT_TYPES = ("text/", "application/json", "application/javascript", "image/svg+xml")


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "AlDohaDashboard/1.0"

    def log_message(self, fmt_, *args):  # keep the console quiet except for errors
        if args and str(args[1])[:1] in "45":
            super().log_message(fmt_, *args)

    def send(self, body, ctype, status=200, extra=None):
        if any(ctype.startswith(t) for t in TEXT_TYPES) and "gzip" in self.headers.get("Accept-Encoding", "") \
                and len(body) > 1024:
            body = gzip.compress(body, 6)
            extra = {**(extra or {}), "Content-Encoding": "gzip"}
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, obj):
        self.send(json.dumps(obj, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")

    def do_GET(self):
        url = urlparse(self.path)
        path = url.path
        try:
            if path in ("/", "/index.html"):
                version = str(int(max(p.stat().st_mtime for p in STATIC.rglob("*") if p.is_file())))
                html = TEMPLATE.read_text(encoding="utf-8").replace("{{v}}", version)
                return self.send(html.encode("utf-8"), "text/html; charset=utf-8")
            if path == "/api/config":
                return self.send_json(build_config())
            if path == "/api/live":
                with LIVE_LOCK:
                    return self.send_json(snapshot())
            if path == "/api/report":
                return self.report(parse_qs(url.query))
            if path.startswith("/static/"):
                return self.static(path[len("/static/"):])
            self.send(b"Not found", "text/plain; charset=utf-8", 404)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def static(self, rel):
        target = (STATIC / rel).resolve()
        if STATIC not in target.parents or not target.is_file():
            return self.send(b"Not found", "text/plain; charset=utf-8", 404)
        ctype = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype == "application/javascript":
            ctype += "; charset=utf-8"
        self.send(target.read_bytes(), ctype)

    def report(self, q):
        items = reports()
        try:
            i = int(q.get("i", ["-1"])[0])
            title, period, rows = items[i]
        except (ValueError, IndexError):
            return self.send(b"Unknown report", "text/plain; charset=utf-8", 400)
        kind = q.get("fmt", ["pdf"])[0]
        name = title.lower().replace(" ", "-").replace("&", "and") + "-" + datetime.now().strftime("%Y-%m-%d")
        if kind == "csv":
            body, ctype, name = make_csv(rows), "text/csv; charset=utf-8", name + ".csv"
        else:
            body, ctype, name = make_pdf(title, period, rows), "application/pdf", name + ".pdf"
        self.send(body, ctype, extra={"Content-Disposition": f'attachment; filename="{name}"'})


def main():
    mimetypes.add_type("application/javascript", ".js")
    mimetypes.add_type("text/css", ".css")
    live_tick()
    threading.Thread(target=live_loop, daemon=True).start()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Al Doha Food dashboard running at http://localhost:{PORT}  (Ctrl+C to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
