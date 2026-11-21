const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const { db, logAudit } = require('./database');
const { seedDatabase } = require('./seed');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// MIME types mapping
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// Helper to parse JSON body
function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 2 * 1024 * 1024) { // 2MB limit
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON: ' + err.message));
      }
    });
    req.on('error', reject);
  });
}

// Helper to send JSON responses
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

// Calculation engine for Quality Metrics
function calculateQualityMetrics() {
  // Batch yield and totals
  const batchStats = db.prepare(`
    SELECT 
      SUM(units_inspected) as total_inspected,
      SUM(units_passed) as total_passed,
      SUM(units_failed) as total_failed
    FROM production_batches
  `).get() || { total_inspected: 0, total_passed: 0, total_failed: 0 };

  const totalInspected = batchStats.total_inspected || 1;
  const totalPassed = batchStats.total_passed || 0;
  const totalFailed = batchStats.total_failed || 0;

  // First Pass Yield (FPY) %
  const fpy = totalInspected > 0 ? Number(((totalPassed / totalInspected) * 100).toFixed(2)) : 100.0;

  // Total Defects
  const totalDefectsRow = db.prepare(`SELECT COUNT(*) as count FROM defects`).get();
  const totalDefects = totalDefectsRow.count || 0;

  // Open & Active Defects
  const openDefectsRow = db.prepare(`
    SELECT COUNT(*) as count FROM defects 
    WHERE status NOT IN ('VERIFIED_CLOSED')
  `).get();
  const openDefects = openDefectsRow.count || 0;

  // Critical Defects
  const criticalDefectsRow = db.prepare(`
    SELECT COUNT(*) as count FROM defects 
    WHERE severity = 'CRITICAL' AND status NOT IN ('VERIFIED_CLOSED')
  `).get();
  const criticalDefects = criticalDefectsRow.count || 0;

  // DPMO calculation (assuming standard 5 defect opportunities per unit)
  const opportunitiesPerUnit = 5;
  const totalOpportunities = totalInspected * opportunitiesPerUnit;
  const dpmo = totalOpportunities > 0 ? Math.round((totalDefects / totalOpportunities) * 1_000_000) : 0;

  // Defect Density per 1,000 units
  const defectDensity = totalInspected > 0 ? Number(((totalDefects / totalInspected) * 1000).toFixed(2)) : 0;

  // Open CAPAs
  const openCapasRow = db.prepare(`
    SELECT COUNT(*) as count FROM defect_capa 
    WHERE status NOT IN ('VERIFIED')
  `).get();
  const openCapas = openCapasRow.count || 0;

  // Average MTTR (in days or hours)
  const closedDefects = db.prepare(`
    SELECT discovered_at, verified_at 
    FROM defects 
    WHERE status = 'VERIFIED_CLOSED' AND verified_at IS NOT NULL
  `).all();

  let avgMttrHours = 18.5; // default fallback
  if (closedDefects.length > 0) {
    let totalHours = 0;
    for (const d of closedDefects) {
      const diff = new Date(d.verified_at).getTime() - new Date(d.discovered_at).getTime();
      totalHours += Math.max(1, diff / (1000 * 60 * 60));
    }
    avgMttrHours = Number((totalHours / closedDefects.length).toFixed(1));
  }

  return {
    fpy,
    dpmo,
    defectDensity,
    totalDefects,
    openDefects,
    criticalDefects,
    openCapas,
    totalInspected,
    totalPassed,
    totalFailed,
    avgMttrHours
  };
}

// Router handler
async function handleApiRequest(req, res, parsedUrl) {
  const method = req.method;
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;

  // CORS pre-flight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  try {
    // 1. Health check
    if (pathname === '/api/health' && method === 'GET') {
      return sendJSON(res, 200, { status: 'healthy', timestamp: new Date().toISOString() });
    }

    // 2. Metrics Overview
    if (pathname === '/api/metrics/overview' && method === 'GET') {
      const metrics = calculateQualityMetrics();
      return sendJSON(res, 200, metrics);
    }

    // 3. Pareto Analysis (Defect Type Frequency & Cumulative %)
    if (pathname === '/api/metrics/pareto' && method === 'GET') {
      const rows = db.prepare(`
        SELECT defect_type, COUNT(*) as count
        FROM defects
        GROUP BY defect_type
        ORDER BY count DESC
      `).all();

      const total = rows.reduce((acc, r) => acc + r.count, 0) || 1;
      let runningSum = 0;
      const paretoData = rows.map(r => {
        runningSum += r.count;
        return {
          type: r.defect_type,
          count: r.count,
          cumulative_pct: Number(((runningSum / total) * 100).toFixed(1))
        };
      });

      return sendJSON(res, 200, { items: paretoData, totalDefects: total });
    }

    // 4. Metrics: Severity breakdown & Status distribution
    if (pathname === '/api/metrics/distributions' && method === 'GET') {
      const severityRows = db.prepare(`
        SELECT severity, COUNT(*) as count 
        FROM defects 
        GROUP BY severity
      `).all();

      const statusRows = db.prepare(`
        SELECT status, COUNT(*) as count 
        FROM defects 
        GROUP BY status
      `).all();

      return sendJSON(res, 200, { severity: severityRows, status: statusRows });
    }

    // 5. Products
    if (pathname === '/api/products' && method === 'GET') {
      const products = db.prepare(`
        SELECT p.*, 
          (SELECT COUNT(*) FROM production_batches b WHERE b.product_id = p.id) as batch_count,
          (SELECT COUNT(*) FROM defects d WHERE d.product_id = p.id) as defect_count
        FROM products p
        ORDER BY p.name ASC
      `).all();
      return sendJSON(res, 200, products);
    }

    if (pathname === '/api/products' && method === 'POST') {
      const body = await parseRequestBody(req);
      if (!body.sku || !body.name || !body.category) {
        return sendJSON(res, 400, { error: 'SKU, Name, and Category are required.' });
      }
      const id = 'PROD-' + Date.now().toString().slice(-4);
      db.prepare(`
        INSERT INTO products (id, sku, name, category, description, target_fpy)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, body.sku, body.name, body.category, body.description || '', body.target_fpy || 98.5);

      logAudit('PRODUCT', id, 'CREATED', body.created_by || 'System Admin', { sku: body.sku, name: body.name });
      const created = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
      return sendJSON(res, 201, created);
    }

    // 6. Batches
    if (pathname === '/api/batches' && method === 'GET') {
      const batches = db.prepare(`
        SELECT b.*, p.name as product_name, p.sku as product_sku,
          (SELECT COUNT(*) FROM defects d WHERE d.batch_id = b.id) as defect_count
        FROM production_batches b
        JOIN products p ON b.product_id = p.id
        ORDER BY b.created_at DESC
      `).all();
      return sendJSON(res, 200, batches);
    }

    if (pathname === '/api/batches' && method === 'POST') {
      const body = await parseRequestBody(req);
      if (!body.batch_number || !body.product_id || !body.units_produced) {
        return sendJSON(res, 400, { error: 'Batch Number, Product, and Units Produced are required.' });
      }
      const id = 'BATCH-' + Date.now().toString().slice(-5);
      const unitsProduced = parseInt(body.units_produced, 10);
      const unitsInspected = parseInt(body.units_inspected || unitsProduced, 10);
      const unitsFailed = parseInt(body.units_failed || 0, 10);
      const unitsPassed = Math.max(0, unitsInspected - unitsFailed);

      db.prepare(`
        INSERT INTO production_batches (id, batch_number, product_id, units_produced, units_inspected, units_passed, units_failed, manufacturing_line, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, body.batch_number, body.product_id, unitsProduced, unitsInspected, unitsPassed, unitsFailed, body.manufacturing_line || 'Main Assembly Line', body.status || 'IN_PRODUCTION');

      logAudit('BATCH', id, 'CREATED', body.created_by || 'Production Supervisor', { batch_number: body.batch_number });
      const created = db.prepare('SELECT * FROM production_batches WHERE id = ?').get(id);
      return sendJSON(res, 201, created);
    }

    // 7. Checkpoints
    if (pathname === '/api/checkpoints' && method === 'GET') {
      const checkpoints = db.prepare(`SELECT * FROM inspection_checkpoints ORDER BY stage, name`).all();
      return sendJSON(res, 200, checkpoints);
    }

    // 8. Defects Listing with Filters
    if (pathname === '/api/defects' && method === 'GET') {
      let querySql = `
        SELECT d.*, 
          p.name as product_name, p.sku as product_sku,
          b.batch_number,
          c.name as checkpoint_name, c.stage as checkpoint_stage,
          (SELECT COUNT(*) FROM defect_capa dc WHERE dc.defect_id = d.id) as capa_count,
          (SELECT COUNT(*) FROM defect_comments dcm WHERE dcm.defect_id = d.id) as comment_count,
          (SELECT COUNT(*) FROM defect_rca rca WHERE rca.defect_id = d.id) as has_rca
        FROM defects d
        JOIN products p ON d.product_id = p.id
        JOIN production_batches b ON d.batch_id = b.id
        LEFT JOIN inspection_checkpoints c ON d.checkpoint_id = c.id
        WHERE 1=1
      `;
      const params = [];

      if (query.status && query.status !== 'ALL') {
        querySql += ` AND d.status = ?`;
        params.push(query.status);
      }
      if (query.severity && query.severity !== 'ALL') {
        querySql += ` AND d.severity = ?`;
        params.push(query.severity);
      }
      if (query.defect_type && query.defect_type !== 'ALL') {
        querySql += ` AND d.defect_type = ?`;
        params.push(query.defect_type);
      }
      if (query.product_id && query.product_id !== 'ALL') {
        querySql += ` AND d.product_id = ?`;
        params.push(query.product_id);
      }
      if (query.search) {
        querySql += ` AND (d.title LIKE ? OR d.id LIKE ? OR d.description LIKE ? OR b.batch_number LIKE ?)`;
        const wildcard = `%${query.search}%`;
        params.push(wildcard, wildcard, wildcard, wildcard);
      }

      querySql += ` ORDER BY CASE d.priority 
        WHEN 'P1_URGENT' THEN 1 
        WHEN 'P2_HIGH' THEN 2 
        WHEN 'P3_MEDIUM' THEN 3 
        ELSE 4 END, d.discovered_at DESC`;

      const defects = db.prepare(querySql).all(...params);
      return sendJSON(res, 200, defects);
    }

    // 9. Single Defect Deep View
    const defectMatch = pathname.match(/^\/api\/defects\/([^/]+)$/);
    if (defectMatch && method === 'GET') {
      const defectId = defectMatch[1];
      const defect = db.prepare(`
        SELECT d.*, 
          p.name as product_name, p.sku as product_sku, p.category as product_category,
          b.batch_number, b.units_produced, b.manufacturing_line,
          c.name as checkpoint_name, c.stage as checkpoint_stage, c.criteria as checkpoint_criteria
        FROM defects d
        JOIN products p ON d.product_id = p.id
        JOIN production_batches b ON d.batch_id = b.id
        LEFT JOIN inspection_checkpoints c ON d.checkpoint_id = c.id
        WHERE d.id = ?
      `).get(defectId);

      if (!defect) {
        return sendJSON(res, 404, { error: 'Defect not found' });
      }

      // Root cause analysis (5-Whys)
      const rca = db.prepare(`SELECT * FROM defect_rca WHERE defect_id = ?`).get(defectId) || null;

      // CAPA actions
      const capas = db.prepare(`SELECT * FROM defect_capa WHERE defect_id = ? ORDER BY created_at ASC`).all(defectId);

      // Audit logs
      const auditLogs = db.prepare(`
        SELECT * FROM audit_logs 
        WHERE (entity_type = 'DEFECT' AND entity_id = ?) 
           OR (entity_type = 'RCA' AND entity_id IN (SELECT id FROM defect_rca WHERE defect_id = ?))
           OR (entity_type = 'CAPA' AND entity_id IN (SELECT id FROM defect_capa WHERE defect_id = ?))
        ORDER BY timestamp DESC
      `).all(defectId, defectId, defectId);

      // Comments
      const comments = db.prepare(`
        SELECT * FROM defect_comments WHERE defect_id = ? ORDER BY created_at ASC
      `).all(defectId);

      return sendJSON(res, 200, {
        defect,
        rca,
        capas,
        auditLogs,
        comments
      });
    }

    // 10. Create New Defect
    if (pathname === '/api/defects' && method === 'POST') {
      const body = await parseRequestBody(req);
      if (!body.title || !body.description || !body.product_id || !body.batch_id || !body.defect_type || !body.severity) {
        return sendJSON(res, 400, { error: 'Missing required fields for defect logging.' });
      }

      // Generate sequence id like DEF-2026-107
      const lastDefect = db.prepare(`SELECT id FROM defects ORDER BY rowid DESC LIMIT 1`).get();
      let nextNum = 101;
      if (lastDefect && lastDefect.id) {
        const match = lastDefect.id.match(/\d+$/);
        if (match) nextNum = parseInt(match[0], 10) + 1;
      }
      const newId = `DEF-2026-${nextNum}`;

      db.prepare(`
        INSERT INTO defects (
          id, title, description, product_id, batch_id, checkpoint_id,
          defect_type, severity, priority, status, discovered_by, assigned_to,
          containment_action
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW', ?, ?, ?)
      `).run(
        newId,
        body.title,
        body.description,
        body.product_id,
        body.batch_id,
        body.checkpoint_id || null,
        body.defect_type,
        body.severity,
        body.priority || 'P2_HIGH',
        body.discovered_by || 'Quality Inspector',
        body.assigned_to || null,
        body.containment_action || null
      );

      // Audit Log
      logAudit('DEFECT', newId, 'CREATED', body.discovered_by || 'Quality Inspector', {
        title: body.title,
        severity: body.severity,
        priority: body.priority,
        batch_id: body.batch_id
      });

      const created = db.prepare('SELECT * FROM defects WHERE id = ?').get(newId);
      return sendJSON(res, 201, created);
    }

    // 11. Defect State Machine Lifecycle Transition
    const statusMatch = pathname.match(/^\/api\/defects\/([^/]+)\/status$/);
    if (statusMatch && method === 'POST') {
      const defectId = statusMatch[1];
      const body = await parseRequestBody(req);
      const newStatus = body.status;
      const performedBy = body.performed_by || 'QA Specialist';
      const reason = body.reason || '';

      const VALID_STATUSES = [
        'NEW',
        'TRIAGED',
        'UNDER_INVESTIGATION',
        'RCA_COMPLETED',
        'CAPA_PENDING',
        'RESOLVED',
        'VERIFIED_CLOSED',
        'REOPENED'
      ];

      if (!VALID_STATUSES.includes(newStatus)) {
        return sendJSON(res, 400, { error: `Invalid status: ${newStatus}` });
      }

      const defect = db.prepare('SELECT * FROM defects WHERE id = ?').get(defectId);
      if (!defect) return sendJSON(res, 404, { error: 'Defect not found' });

      const oldStatus = defect.status;
      const now = new Date().toISOString();

      let resolvedAt = defect.resolved_at;
      let verifiedAt = defect.verified_at;

      if (newStatus === 'RESOLVED' && !resolvedAt) {
        resolvedAt = now;
      }
      if (newStatus === 'VERIFIED_CLOSED') {
        if (!resolvedAt) resolvedAt = now;
        verifiedAt = now;
      }
      if (newStatus === 'REOPENED') {
        resolvedAt = null;
        verifiedAt = null;
      }

      db.prepare(`
        UPDATE defects 
        SET status = ?, resolved_at = ?, verified_at = ?, resolution_notes = COALESCE(?, resolution_notes)
        WHERE id = ?
      `).run(newStatus, resolvedAt, verifiedAt, body.resolution_notes || null, defectId);

      logAudit('DEFECT', defectId, 'STATUS_CHANGE', performedBy, {
        from: oldStatus,
        to: newStatus,
        reason: reason
      });

      return sendJSON(res, 200, { success: true, defectId, from: oldStatus, to: newStatus });
    }

    // 12. Save / Update RCA (5-Whys and Fishbone)
    const rcaMatch = pathname.match(/^\/api\/defects\/([^/]+)\/rca$/);
    if (rcaMatch && (method === 'PUT' || method === 'POST')) {
      const defectId = rcaMatch[1];
      const body = await parseRequestBody(req);

      const existingRca = db.prepare('SELECT id FROM defect_rca WHERE defect_id = ?').get(defectId);
      const rcaId = existingRca ? existingRca.id : 'RCA-' + defectId.replace('DEF-', '');
      const analyzedBy = body.analyzed_by || 'QA Engineering Lead';

      if (existingRca) {
        db.prepare(`
          UPDATE defect_rca 
          SET fishbone_category = ?, why_1 = ?, why_2 = ?, why_3 = ?, why_4 = ?, why_5 = ?,
              root_cause_conclusion = ?, analyzed_by = ?, updated_at = CURRENT_TIMESTAMP
          WHERE defect_id = ?
        `).run(
          body.fishbone_category || 'MACHINE',
          body.why_1 || '',
          body.why_2 || '',
          body.why_3 || '',
          body.why_4 || '',
          body.why_5 || '',
          body.root_cause_conclusion || '',
          analyzedBy,
          defectId
        );
      } else {
        db.prepare(`
          INSERT INTO defect_rca (
            id, defect_id, fishbone_category, why_1, why_2, why_3, why_4, why_5,
            root_cause_conclusion, analyzed_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          rcaId,
          defectId,
          body.fishbone_category || 'MACHINE',
          body.why_1 || '',
          body.why_2 || '',
          body.why_3 || '',
          body.why_4 || '',
          body.why_5 || '',
          body.root_cause_conclusion || '',
          analyzedBy
        );
      }

      // If defect is currently in UNDER_INVESTIGATION, advance to RCA_COMPLETED
      const defect = db.prepare('SELECT status FROM defects WHERE id = ?').get(defectId);
      if (defect && defect.status === 'UNDER_INVESTIGATION') {
        db.prepare(`UPDATE defects SET status = 'RCA_COMPLETED' WHERE id = ?`).run(defectId);
      }

      logAudit('RCA', rcaId, 'RCA_UPDATED', analyzedBy, {
        defect_id: defectId,
        category: body.fishbone_category,
        conclusion: body.root_cause_conclusion
      });

      const updated = db.prepare('SELECT * FROM defect_rca WHERE defect_id = ?').get(defectId);
      return sendJSON(res, 200, updated);
    }

    // 13. Add CAPA Action
    const capaPostMatch = pathname.match(/^\/api\/defects\/([^/]+)\/capa$/);
    if (capaPostMatch && method === 'POST') {
      const defectId = capaPostMatch[1];
      const body = await parseRequestBody(req);

      if (!body.action_type || !body.description || !body.owner || !body.target_date) {
        return sendJSON(res, 400, { error: 'Action type, description, owner, and target date are required.' });
      }

      const capaId = 'CAPA-' + Date.now().toString().slice(-6);
      db.prepare(`
        INSERT INTO defect_capa (id, defect_id, action_type, description, owner, target_date, status)
        VALUES (?, ?, ?, ?, ?, ?, 'PLANNED')
      `).run(capaId, defectId, body.action_type, body.description, body.owner, body.target_date);

      // If defect is RCA_COMPLETED, transition to CAPA_PENDING
      const defect = db.prepare('SELECT status FROM defects WHERE id = ?').get(defectId);
      if (defect && defect.status === 'RCA_COMPLETED') {
        db.prepare(`UPDATE defects SET status = 'CAPA_PENDING' WHERE id = ?`).run(defectId);
      }

      logAudit('CAPA', capaId, 'CAPA_ADDED', body.owner, {
        defect_id: defectId,
        action_type: body.action_type,
        target_date: body.target_date
      });

      const created = db.prepare('SELECT * FROM defect_capa WHERE id = ?').get(capaId);
      return sendJSON(res, 201, created);
    }

    // 14. Update CAPA Status
    const capaPatchMatch = pathname.match(/^\/api\/capa\/([^/]+)$/);
    if (capaPatchMatch && method === 'PATCH') {
      const capaId = capaPatchMatch[1];
      const body = await parseRequestBody(req);
      const capa = db.prepare('SELECT * FROM defect_capa WHERE id = ?').get(capaId);
      if (!capa) return sendJSON(res, 404, { error: 'CAPA not found' });

      const newStatus = body.status || capa.status;
      const verificationNotes = body.verification_notes !== undefined ? body.verification_notes : capa.verification_notes;

      db.prepare(`
        UPDATE defect_capa 
        SET status = ?, verification_notes = ? 
        WHERE id = ?
      `).run(newStatus, verificationNotes, capaId);

      logAudit('CAPA', capaId, 'CAPA_UPDATED', body.performed_by || 'QA Lead', {
        status: newStatus,
        notes: verificationNotes
      });

      const updated = db.prepare('SELECT * FROM defect_capa WHERE id = ?').get(capaId);
      return sendJSON(res, 200, updated);
    }

    // 15. Add Comment to Defect
    const commentMatch = pathname.match(/^\/api\/defects\/([^/]+)\/comments$/);
    if (commentMatch && method === 'POST') {
      const defectId = commentMatch[1];
      const body = await parseRequestBody(req);
      if (!body.comment || !body.comment.trim()) {
        return sendJSON(res, 400, { error: 'Comment text is required.' });
      }

      const author = body.author || 'Inspector';
      db.prepare(`
        INSERT INTO defect_comments (defect_id, author, comment)
        VALUES (?, ?, ?)
      `).run(defectId, author, body.comment.trim());

      const comments = db.prepare('SELECT * FROM defect_comments WHERE defect_id = ? ORDER BY created_at ASC').all(defectId);
      return sendJSON(res, 201, comments);
    }

    // 16. Re-seed demo database
    if (pathname === '/api/seed' && method === 'POST') {
      seedDatabase();
      return sendJSON(res, 200, { message: 'Database successfully reseeded with test records' });
    }

    // 404 for unmatched API routes
    return sendJSON(res, 404, { error: 'API route not found' });
  } catch (error) {
    console.error('API Error:', error);
    return sendJSON(res, 500, { error: error.message });
  }
}

// Serve static frontend files
function serveStaticFile(req, res, pathname) {
  let relativePath = pathname === '/' ? 'index.html' : pathname;
  // Prevent directory traversal
  const safePath = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback to index.html for SPA routing
      const indexPath = path.join(PUBLIC_DIR, 'index.html');
      fs.readFile(indexPath, (indexErr, content) => {
        if (indexErr) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          return res.end('404 Not Found');
        }
        res.writeHead(200, { 'Content-Type': MIME_TYPES['.html'] });
        res.end(content);
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        return res.end('Internal Server Error');
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  if (parsedUrl.pathname.startsWith('/api/')) {
    handleApiRequest(req, res, parsedUrl);
  } else {
    serveStaticFile(req, res, parsedUrl.pathname);
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(` Product Quality & Defect Tracking System Server`);
    console.log(` Running at: http://localhost:${PORT}`);
    console.log(` API Endpoint: http://localhost:${PORT}/api/health`);
    console.log(`=======================================================`);
  });
}

module.exports = { server, PORT, handleApiRequest };
