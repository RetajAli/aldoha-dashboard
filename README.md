# Al Doha Food Industries – Plant Dashboard (demo)

A Python-served plant operations dashboard. It uses the Python standard library only, so there is nothing to `pip install`.

## Run

```
python app.py
```

Then open <http://localhost:8020>. To use another port, set `PORT` first (PowerShell: `$env:PORT=8030; python app.py`).

## Layout

- `app.py` – the HTTP server and **all dashboard data** (every value is DEMO data)
  - `/api/config` – page data, loaded once
  - `/api/live` – simulated live readings every 3 s: machine loads, plant power demand, truck speed and fuel
  - `/api/report?i=<n>&fmt=pdf|csv` – reports generated in Python; the PDF is written by hand, with the Schneider Electric and AVEVA logos embedded and no library
- `templates/index.html` – page shell
- `static/js/dashboard.js` – renders the pages and charts from the data `app.py` sends
- `static/css/styles.css` – light and dark themes, components and motion
- `static/i18n/ar.json` – Arabic translations for the **ع / EN** button in the header (right-to-left layout). Keys are the English text, with `{n}` standing for any number. Add a line here when you add new English text. Downloaded PDFs stay in English.
- `static/images/` – Overview plant photo (4× AI-upscaled) and the Schneider Electric / AVEVA logos
- `_old_html_version/` – the previous static HTML version, kept for reference

## Pages

| Group | Page |
|---|---|
| Operations | Overview, Factories (incl. site plan, filling, storage), Production, Warehouses, Energy Management, Maintenance |
| Logistics | Fleet Management (live map, vehicles, fuel & costs, service & safety), Supply Chain & Costs, Locations (incl. Mansoura) |
| Insights | Reports |

## Assumptions

There is no live PLC, SCADA, ERP or telematics connection. The following are sample assumptions, marked in the UI:

- diesel at EGP 17.5/L
- type consumption norms
- the transport rate of EGP 1.1 per t·km
- import shares

Fleet totals are computed from the vehicle list in `app.py`. They match the logistics figures shown elsewhere: 18 trips, 2 delayed, 81% utilization and EGP 38,900 transport cost. To go live, replace the demo tables in `app.py` with calls to your real systems.

## Deploy (Vercel)

`api/index.py` wraps the same request handler as a Vercel Python function, and `vercel.json` routes every path to it. Vercel functions cannot keep a background thread running, so the live readings advance whenever `/api/live` is requested (one step per 3 s since the last request) instead of on a timer.
