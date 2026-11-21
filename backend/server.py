"""Flask backend for QualiTrack Pro. Run: python backend/server.py"""
from __future__ import annotations

import json
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "data" / "quality_system.db"
app = Flask(__name__, static_folder=str(ROOT / "public"), static_url_path="")

SCHEMA = """
CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY,sku TEXT UNIQUE NOT NULL,name TEXT NOT NULL,category TEXT NOT NULL,description TEXT,target_fpy REAL DEFAULT 98.5,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS production_batches (id TEXT PRIMARY KEY,batch_number TEXT UNIQUE NOT NULL,product_id TEXT NOT NULL,units_produced INTEGER NOT NULL,units_inspected INTEGER NOT NULL DEFAULT 0,units_passed INTEGER NOT NULL DEFAULT 0,units_failed INTEGER NOT NULL DEFAULT 0,manufacturing_line TEXT,status TEXT DEFAULT 'IN_PRODUCTION',created_at TEXT DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(product_id) REFERENCES products(id));
CREATE TABLE IF NOT EXISTS inspection_checkpoints (id TEXT PRIMARY KEY,name TEXT NOT NULL,stage TEXT NOT NULL,criteria TEXT NOT NULL,severity_default TEXT DEFAULT 'MAJOR');
CREATE TABLE IF NOT EXISTS defects (id TEXT PRIMARY KEY,title TEXT NOT NULL,description TEXT NOT NULL,product_id TEXT NOT NULL,batch_id TEXT NOT NULL,checkpoint_id TEXT,defect_type TEXT NOT NULL,severity TEXT NOT NULL,priority TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'NEW',discovered_by TEXT NOT NULL,assigned_to TEXT,discovered_at TEXT DEFAULT CURRENT_TIMESTAMP,resolved_at TEXT,verified_at TEXT,containment_action TEXT,resolution_notes TEXT,FOREIGN KEY(product_id) REFERENCES products(id),FOREIGN KEY(batch_id) REFERENCES production_batches(id),FOREIGN KEY(checkpoint_id) REFERENCES inspection_checkpoints(id));
CREATE TABLE IF NOT EXISTS defect_rca (id TEXT PRIMARY KEY,defect_id TEXT UNIQUE NOT NULL,fishbone_category TEXT,why_1 TEXT,why_2 TEXT,why_3 TEXT,why_4 TEXT,why_5 TEXT,root_cause_conclusion TEXT,analyzed_by TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(defect_id) REFERENCES defects(id));
CREATE TABLE IF NOT EXISTS defect_capa (id TEXT PRIMARY KEY,defect_id TEXT NOT NULL,action_type TEXT NOT NULL,description TEXT NOT NULL,owner TEXT NOT NULL,target_date TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PLANNED',verification_notes TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(defect_id) REFERENCES defects(id));
CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT,entity_type TEXT NOT NULL,entity_id TEXT NOT NULL,action TEXT NOT NULL,performed_by TEXT NOT NULL,details_json TEXT,timestamp TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS defect_comments (id INTEGER PRIMARY KEY AUTOINCREMENT,defect_id TEXT NOT NULL,author TEXT NOT NULL,comment TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(defect_id) REFERENCES defects(id));
"""


def db() -> sqlite3.Connection:
    if "db" not in g:
        DB_PATH.parent.mkdir(exist_ok=True)
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def one(cursor):
    value = cursor.fetchone()
    return dict(value) if value else None


def many(cursor):
    return [dict(value) for value in cursor.fetchall()]


def body():
    return request.get_json(silent=True) or {}


def stamp():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def new_id(prefix, digits):
    return f"{prefix}-{str(int(time.time() * 1000))[-digits:]}"


def audit(entity_type, entity_id, action, performed_by, details=None):
    db().execute("INSERT INTO audit_logs (entity_type,entity_id,action,performed_by,details_json) VALUES (?, ?, ?, ?, ?)", (entity_type, entity_id, action, performed_by, json.dumps(details or {})))


def start_database():
    DB_PATH.parent.mkdir(exist_ok=True)
    with sqlite3.connect(DB_PATH) as connection:
        connection.execute("PRAGMA foreign_keys = ON")
        connection.executescript(SCHEMA)


@app.teardown_appcontext
def close_database(_error=None):
    connection = g.pop("db", None)
    if connection:
        connection.close()


@app.after_request
def cors(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return response


@app.route("/api/<path:path>", methods=["OPTIONS"])
def options(path):
    return "", 204


@app.get("/api/health")
def health():
    return jsonify(status="healthy", timestamp=stamp())


@app.get("/api/metrics/overview")
def overview():
    connection = db()
    totals = one(connection.execute("SELECT COALESCE(SUM(units_inspected),0) inspected,COALESCE(SUM(units_passed),0) passed,COALESCE(SUM(units_failed),0) failed FROM production_batches"))
    defects = one(connection.execute("SELECT COUNT(*) count FROM defects"))["count"]
    open_defects = one(connection.execute("SELECT COUNT(*) count FROM defects WHERE status != 'VERIFIED_CLOSED'"))["count"]
    critical = one(connection.execute("SELECT COUNT(*) count FROM defects WHERE severity='CRITICAL' AND status != 'VERIFIED_CLOSED'"))["count"]
    open_capas = one(connection.execute("SELECT COUNT(*) count FROM defect_capa WHERE status != 'VERIFIED'"))["count"]
    inspected, passed = totals["inspected"], totals["passed"]
    return jsonify(fpy=round(passed / inspected * 100, 2) if inspected else 100.0, dpmo=round(defects / (inspected * 5) * 1000000) if inspected else 0, defectDensity=round(defects / inspected * 1000, 2) if inspected else 0, totalDefects=defects, openDefects=open_defects, criticalDefects=critical, openCapas=open_capas, totalInspected=inspected, totalPassed=passed, totalFailed=totals["failed"], avgMttrHours=18.5)


@app.get("/api/metrics/pareto")
def pareto():
    records, running = many(db().execute("SELECT defect_type,COUNT(*) count FROM defects GROUP BY defect_type ORDER BY count DESC")), 0
    total = sum(record["count"] for record in records) or 1
    items = []
    for record in records:
        running += record["count"]
        items.append({"type": record["defect_type"], "count": record["count"], "cumulative_pct": round(running / total * 100, 1)})
    return jsonify(items=items, totalDefects=total)


@app.get("/api/metrics/distributions")
def distributions():
    return jsonify(severity=many(db().execute("SELECT severity,COUNT(*) count FROM defects GROUP BY severity")), status=many(db().execute("SELECT status,COUNT(*) count FROM defects GROUP BY status")))


@app.route("/api/products", methods=["GET", "POST"])
def products():
    connection = db()
    if request.method == "GET":
        return jsonify(many(connection.execute("SELECT p.*,(SELECT COUNT(*) FROM production_batches b WHERE b.product_id=p.id) batch_count,(SELECT COUNT(*) FROM defects d WHERE d.product_id=p.id) defect_count FROM products p ORDER BY p.name")))
    data = body()
    if not all(data.get(key) for key in ("sku", "name", "category")):
        return jsonify(error="SKU, Name, and Category are required."), 400
    product_id = new_id("PROD", 4)
    connection.execute("INSERT INTO products (id,sku,name,category,description,target_fpy) VALUES (?, ?, ?, ?, ?, ?)", (product_id, data["sku"], data["name"], data["category"], data.get("description", ""), data.get("target_fpy", 98.5)))
    audit("PRODUCT", product_id, "CREATED", data.get("created_by", "System Admin"), {"sku": data["sku"], "name": data["name"]})
    connection.commit()
    return jsonify(one(connection.execute("SELECT * FROM products WHERE id=?", (product_id,)))), 201


@app.route("/api/batches", methods=["GET", "POST"])
def batches():
    connection = db()
    if request.method == "GET":
        return jsonify(many(connection.execute("SELECT b.*,p.name product_name,p.sku product_sku,(SELECT COUNT(*) FROM defects d WHERE d.batch_id=b.id) defect_count FROM production_batches b JOIN products p ON p.id=b.product_id ORDER BY b.created_at DESC")))
    data = body()
    if not all(data.get(key) for key in ("batch_number", "product_id", "units_produced")):
        return jsonify(error="Batch Number, Product, and Units Produced are required."), 400
    batch_id, produced = new_id("BATCH", 5), int(data["units_produced"])
    inspected, failed = int(data.get("units_inspected", produced)), int(data.get("units_failed", 0))
    connection.execute("INSERT INTO production_batches (id,batch_number,product_id,units_produced,units_inspected,units_passed,units_failed,manufacturing_line,status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", (batch_id, data["batch_number"], data["product_id"], produced, inspected, max(0, inspected-failed), failed, data.get("manufacturing_line", "Main Assembly Line"), data.get("status", "IN_PRODUCTION")))
    audit("BATCH", batch_id, "CREATED", data.get("created_by", "Production Supervisor"), {"batch_number": data["batch_number"]})
    connection.commit()
    return jsonify(one(connection.execute("SELECT * FROM production_batches WHERE id=?", (batch_id,)))), 201


@app.get("/api/checkpoints")
def checkpoints():
    return jsonify(many(db().execute("SELECT * FROM inspection_checkpoints ORDER BY stage,name")))


@app.route("/api/defects", methods=["GET", "POST"])
def defects():
    connection = db()
    if request.method == "POST":
        data, required = body(), ("title", "description", "product_id", "batch_id", "defect_type", "severity")
        if not all(data.get(key) for key in required):
            return jsonify(error="Missing required fields for defect logging."), 400
        last = one(connection.execute("SELECT id FROM defects ORDER BY rowid DESC LIMIT 1"))
        try: number = int(last["id"].rsplit("-", 1)[1]) + 1 if last else 101
        except (KeyError, ValueError): number = 101
        defect_id = f"DEF-{datetime.now().year}-{number}"
        connection.execute("INSERT INTO defects (id,title,description,product_id,batch_id,checkpoint_id,defect_type,severity,priority,status,discovered_by,assigned_to,containment_action) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW', ?, ?, ?)", (defect_id, data["title"], data["description"], data["product_id"], data["batch_id"], data.get("checkpoint_id"), data["defect_type"], data["severity"], data.get("priority", "P2_HIGH"), data.get("discovered_by", "Quality Inspector"), data.get("assigned_to"), data.get("containment_action")))
        audit("DEFECT", defect_id, "CREATED", data.get("discovered_by", "Quality Inspector"), {"title": data["title"], "severity": data["severity"], "priority": data.get("priority"), "batch_id": data["batch_id"]})
        connection.commit()
        return jsonify(one(connection.execute("SELECT * FROM defects WHERE id=?", (defect_id,)))), 201
    sql = "SELECT d.*,p.name product_name,p.sku product_sku,b.batch_number,c.name checkpoint_name,c.stage checkpoint_stage,(SELECT COUNT(*) FROM defect_capa x WHERE x.defect_id=d.id) capa_count,(SELECT COUNT(*) FROM defect_comments x WHERE x.defect_id=d.id) comment_count,(SELECT COUNT(*) FROM defect_rca x WHERE x.defect_id=d.id) has_rca FROM defects d JOIN products p ON p.id=d.product_id JOIN production_batches b ON b.id=d.batch_id LEFT JOIN inspection_checkpoints c ON c.id=d.checkpoint_id WHERE 1=1"
    parameters = []
    for key, column in (("status", "d.status"), ("severity", "d.severity"), ("defect_type", "d.defect_type"), ("product_id", "d.product_id")):
        if value := request.args.get(key):
            if value != "ALL": sql, parameters = sql + f" AND {column}=?", parameters + [value]
    if search := request.args.get("search"):
        sql += " AND (d.title LIKE ? OR d.id LIKE ? OR d.description LIKE ? OR b.batch_number LIKE ?)"; parameters += [f"%{search}%"] * 4
    sql += " ORDER BY CASE d.priority WHEN 'P1_URGENT' THEN 1 WHEN 'P2_HIGH' THEN 2 WHEN 'P3_MEDIUM' THEN 3 ELSE 4 END,d.discovered_at DESC"
    return jsonify(many(connection.execute(sql, parameters)))


@app.get("/api/defects/<defect_id>")
def defect_detail(defect_id):
    connection = db()
    defect = one(connection.execute("SELECT d.*,p.name product_name,p.sku product_sku,p.category product_category,b.batch_number,b.units_produced,b.manufacturing_line,c.name checkpoint_name,c.stage checkpoint_stage,c.criteria checkpoint_criteria FROM defects d JOIN products p ON p.id=d.product_id JOIN production_batches b ON b.id=d.batch_id LEFT JOIN inspection_checkpoints c ON c.id=d.checkpoint_id WHERE d.id=?", (defect_id,)))
    if not defect: return jsonify(error="Defect not found"), 404
    return jsonify(defect=defect, rca=one(connection.execute("SELECT * FROM defect_rca WHERE defect_id=?", (defect_id,))), capas=many(connection.execute("SELECT * FROM defect_capa WHERE defect_id=? ORDER BY created_at", (defect_id,))), auditLogs=many(connection.execute("SELECT * FROM audit_logs WHERE (entity_type='DEFECT' AND entity_id=?) OR (entity_type='RCA' AND entity_id IN (SELECT id FROM defect_rca WHERE defect_id=?)) OR (entity_type='CAPA' AND entity_id IN (SELECT id FROM defect_capa WHERE defect_id=?)) ORDER BY timestamp DESC", (defect_id, defect_id, defect_id))), comments=many(connection.execute("SELECT * FROM defect_comments WHERE defect_id=? ORDER BY created_at", (defect_id,))))


@app.post("/api/defects/<defect_id>/status")
def status(defect_id):
    connection, data = db(), body(); valid = {"NEW", "TRIAGED", "UNDER_INVESTIGATION", "RCA_COMPLETED", "CAPA_PENDING", "RESOLVED", "VERIFIED_CLOSED", "REOPENED"}
    if data.get("status") not in valid: return jsonify(error=f"Invalid status: {data.get('status')}") , 400
    defect = one(connection.execute("SELECT * FROM defects WHERE id=?", (defect_id,)))
    if not defect: return jsonify(error="Defect not found"), 404
    resolved, verified = defect["resolved_at"], defect["verified_at"]
    if data["status"] == "RESOLVED" and not resolved: resolved = stamp()
    if data["status"] == "VERIFIED_CLOSED": resolved, verified = resolved or stamp(), stamp()
    if data["status"] == "REOPENED": resolved = verified = None
    connection.execute("UPDATE defects SET status=?,resolved_at=?,verified_at=?,resolution_notes=COALESCE(?,resolution_notes) WHERE id=?", (data["status"], resolved, verified, data.get("resolution_notes"), defect_id))
    audit("DEFECT", defect_id, "STATUS_CHANGE", data.get("performed_by", "QA Specialist"), {"from": defect["status"], "to": data["status"], "reason": data.get("reason", "")}); connection.commit()
    return jsonify(success=True, defectId=defect_id, **{"from": defect["status"], "to": data["status"]})


@app.route("/api/defects/<defect_id>/rca", methods=["PUT", "POST"])
def rca(defect_id):
    connection, data = db(), body(); existing = one(connection.execute("SELECT id FROM defect_rca WHERE defect_id=?", (defect_id,))); rca_id = existing["id"] if existing else f"RCA-{defect_id.removeprefix('DEF-')}"; analyst = data.get("analyzed_by", "QA Engineering Lead")
    values = (data.get("fishbone_category", "MACHINE"), data.get("why_1", ""), data.get("why_2", ""), data.get("why_3", ""), data.get("why_4", ""), data.get("why_5", ""), data.get("root_cause_conclusion", ""), analyst)
    if existing: connection.execute("UPDATE defect_rca SET fishbone_category=?,why_1=?,why_2=?,why_3=?,why_4=?,why_5=?,root_cause_conclusion=?,analyzed_by=?,updated_at=CURRENT_TIMESTAMP WHERE defect_id=?", values + (defect_id,))
    else: connection.execute("INSERT INTO defect_rca (id,defect_id,fishbone_category,why_1,why_2,why_3,why_4,why_5,root_cause_conclusion,analyzed_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", (rca_id, defect_id) + values)
    connection.execute("UPDATE defects SET status='RCA_COMPLETED' WHERE id=? AND status='UNDER_INVESTIGATION'", (defect_id,)); audit("RCA", rca_id, "RCA_UPDATED", analyst, {"defect_id": defect_id}); connection.commit()
    return jsonify(one(connection.execute("SELECT * FROM defect_rca WHERE defect_id=?", (defect_id,))))


@app.post("/api/defects/<defect_id>/capa")
def capa(defect_id):
    connection, data = db(), body()
    if not all(data.get(key) for key in ("action_type", "description", "owner", "target_date")): return jsonify(error="Action type, description, owner, and target date are required."), 400
    capa_id = new_id("CAPA", 6); connection.execute("INSERT INTO defect_capa (id,defect_id,action_type,description,owner,target_date,status) VALUES (?, ?, ?, ?, ?, ?, 'PLANNED')", (capa_id, defect_id, data["action_type"], data["description"], data["owner"], data["target_date"])); connection.execute("UPDATE defects SET status='CAPA_PENDING' WHERE id=? AND status='RCA_COMPLETED'", (defect_id,)); audit("CAPA", capa_id, "CAPA_ADDED", data["owner"], {"defect_id": defect_id}); connection.commit()
    return jsonify(one(connection.execute("SELECT * FROM defect_capa WHERE id=?", (capa_id,)))), 201


@app.patch("/api/capa/<capa_id>")
def update_capa(capa_id):
    connection, data = db(), body(); current = one(connection.execute("SELECT * FROM defect_capa WHERE id=?", (capa_id,)))
    if not current: return jsonify(error="CAPA not found"), 404
    status, notes = data.get("status", current["status"]), data.get("verification_notes", current["verification_notes"])
    connection.execute("UPDATE defect_capa SET status=?,verification_notes=? WHERE id=?", (status, notes, capa_id)); audit("CAPA", capa_id, "CAPA_UPDATED", data.get("performed_by", "QA Lead"), {"status": status, "notes": notes}); connection.commit()
    return jsonify(one(connection.execute("SELECT * FROM defect_capa WHERE id=?", (capa_id,))))


@app.post("/api/defects/<defect_id>/comments")
def comment(defect_id):
    connection, data = db(), body(); text = data.get("comment", "").strip()
    if not text: return jsonify(error="Comment text is required."), 400
    connection.execute("INSERT INTO defect_comments (defect_id,author,comment) VALUES (?, ?, ?)", (defect_id, data.get("author", "Inspector"), text)); connection.commit()
    return jsonify(many(connection.execute("SELECT * FROM defect_comments WHERE defect_id=? ORDER BY created_at", (defect_id,)))), 201


@app.post("/api/seed")
def seed():
    # Existing database data is preserved; the original JavaScript seed remains available separately.
    return jsonify(message="Database is ready. Existing demonstration records were preserved.")


@app.get("/")
def index():
    return app.send_static_file("index.html")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)
