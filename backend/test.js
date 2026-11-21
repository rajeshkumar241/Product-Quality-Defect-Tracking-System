const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const url = require('node:url');
const { handleApiRequest } = require('./server');

// Mock request / response dispatcher for fast in-memory integration testing
function callApi(method, pathStr, bodyObj = null) {
  return new Promise((resolve, reject) => {
    const parsedUrl = url.parse(pathStr, true);

    const req = new EventEmitter();
    req.method = method;
    req.url = pathStr;

    const res = {
      statusCode: 200,
      headers: {},
      body: '',
      writeHead(status, headers) {
        this.statusCode = status;
        this.headers = Object.assign(this.headers, headers);
      },
      end(chunk) {
        if (chunk) this.body += chunk;
        let parsed;
        try {
          parsed = JSON.parse(this.body);
        } catch {
          parsed = this.body;
        }
        resolve({ status: this.statusCode, headers: this.headers, data: parsed });
      }
    };

    // Trigger API handler
    handleApiRequest(req, res, parsedUrl).catch(reject);

    // Stream body if present
    process.nextTick(() => {
      if (bodyObj) {
        req.emit('data', Buffer.from(JSON.stringify(bodyObj)));
      }
      req.emit('end');
    });
  });
}

async function runTests() {
  console.log('--- Starting In-Memory API Integration Test Suite ---');

  try {
    // 1. Health Check
    const health = await callApi('GET', '/api/health');
    assert.strictEqual(health.status, 200);
    assert.strictEqual(health.data.status, 'healthy');
    console.log('✓ Health check passed');

    // 2. Metrics Overview
    const metrics = await callApi('GET', '/api/metrics/overview');
    assert.strictEqual(metrics.status, 200);
    assert.ok(typeof metrics.data.fpy === 'number');
    assert.ok(typeof metrics.data.dpmo === 'number');
    console.log(`✓ Metrics Overview passed: FPY=${metrics.data.fpy}%, DPMO=${metrics.data.dpmo}`);

    // 3. Pareto Analysis
    const pareto = await callApi('GET', '/api/metrics/pareto');
    assert.strictEqual(pareto.status, 200);
    assert.ok(Array.isArray(pareto.data.items));
    console.log(`✓ Pareto Analysis passed: ${pareto.data.items.length} defect categories`);

    // 4. Products List
    const products = await callApi('GET', '/api/products');
    assert.strictEqual(products.status, 200);
    assert.ok(products.data.length >= 4);
    console.log(`✓ Products listing passed: ${products.data.length} products`);

    // 5. Batches List
    const batches = await callApi('GET', '/api/batches');
    assert.strictEqual(batches.status, 200);
    assert.ok(batches.data.length >= 4);
    console.log(`✓ Batches listing passed: ${batches.data.length} production batches`);

    // 6. Checkpoints List
    const checkpoints = await callApi('GET', '/api/checkpoints');
    assert.strictEqual(checkpoints.status, 200);
    assert.ok(checkpoints.data.length >= 5);
    console.log(`✓ Inspection Checkpoints passed: ${checkpoints.data.length} checkpoints`);

    // 7. Defects List
    const defects = await callApi('GET', '/api/defects');
    assert.strictEqual(defects.status, 200);
    assert.ok(defects.data.length >= 6);
    console.log(`✓ Defects list passed: ${defects.data.length} defects returned`);

    // 8. Create Defect
    const newDefectRes = await callApi('POST', '/api/defects', {
      title: 'Automated Test Defect - Porosity defect in cast flange',
      description: 'Micro-porosity discovered along sealing face under helium pressure test.',
      product_id: 'PROD-001',
      batch_id: 'BATCH-2026-A1',
      checkpoint_id: 'CHK-ASM-04',
      defect_type: 'CONTAMINATION',
      severity: 'MAJOR',
      priority: 'P2_HIGH',
      discovered_by: 'Automated QA Test Runner',
      containment_action: 'Batch isolated'
    });
    assert.strictEqual(newDefectRes.status, 201);
    const testDefectId = newDefectRes.data.id;
    console.log(`✓ Defect creation passed: Created ${testDefectId}`);

    // 9. Status Lifecycle Transition
    const triageRes = await callApi('POST', `/api/defects/${testDefectId}/status`, {
      status: 'TRIAGED',
      performed_by: 'QA Lead Marcus',
      reason: 'Assigned to metallurgist for cross-section examination'
    });
    assert.strictEqual(triageRes.status, 200);
    assert.strictEqual(triageRes.data.to, 'TRIAGED');
    console.log(`✓ Status transition passed: NEW -> TRIAGED`);

    // 10. Update RCA (5-Whys)
    const rcaRes = await callApi('PUT', `/api/defects/${testDefectId}/rca`, {
      fishbone_category: 'MATERIAL',
      why_1: 'Why did micro-porosity form? Gas entrapment during casting pour.',
      why_2: 'Why was gas entrapped? Ingot degas vacuum cycle was truncated.',
      why_3: 'Why was degas truncated? Pressure sensor misread chamber vacuum level.',
      why_4: 'Why did sensor misread? Calibration was 3 months overdue.',
      why_5: 'Why was calibration overdue? Preventative maintenance schedule not synchronized with ERP.',
      root_cause_conclusion: 'Overdue vacuum gauge calibration led to insufficient degassing of raw molten alloy.',
      analyzed_by: 'Metallurgical QA Team'
    });
    assert.strictEqual(rcaRes.status, 200);
    console.log('✓ RCA 5-Whys update passed');

    // 11. Add CAPA Action
    const capaRes = await callApi('POST', `/api/defects/${testDefectId}/capa`, {
      action_type: 'CORRECTIVE',
      description: 'Recalibrate foundry vacuum sensor and install secondary redundant pressure gauge.',
      owner: 'Maintenance Chief Dave',
      target_date: '2026-12-01'
    });
    assert.strictEqual(capaRes.status, 201);
    const testCapaId = capaRes.data.id;
    console.log(`✓ CAPA creation passed: ${testCapaId}`);

    // 12. Update CAPA Status
    const capaUpdateRes = await callApi('PATCH', `/api/capa/${testCapaId}`, {
      status: 'IMPLEMENTED',
      verification_notes: 'Redundant gauge installed and zero-point certified.',
      performed_by: 'Senior QA Auditor'
    });
    assert.strictEqual(capaUpdateRes.status, 200);
    assert.strictEqual(capaUpdateRes.data.status, 'IMPLEMENTED');
    console.log('✓ CAPA status update passed: PLANNED -> IMPLEMENTED');

    // 13. Add Comment
    const commentRes = await callApi('POST', `/api/defects/${testDefectId}/comments`, {
      author: 'QA Lead Marcus',
      comment: 'Verification sample tested under 30 bar helium pressure without any leakage detected.'
    });
    assert.strictEqual(commentRes.status, 201);
    console.log('✓ Comment addition passed');

    // 14. Verify Deep Defect Fetch
    const deepDefect = await callApi('GET', `/api/defects/${testDefectId}`);
    assert.strictEqual(deepDefect.status, 200);
    assert.ok(deepDefect.data.rca);
    assert.strictEqual(deepDefect.data.capas.length, 1);
    assert.strictEqual(deepDefect.data.comments.length, 1);
    assert.ok(deepDefect.data.auditLogs.length >= 3);
    console.log(`✓ Defect deep fetch passed: Verified RCA, CAPA, ${deepDefect.data.auditLogs.length} audit logs`);

    // 15. Final resolution and verification
    const resolveRes = await callApi('POST', `/api/defects/${testDefectId}/status`, {
      status: 'VERIFIED_CLOSED',
      performed_by: 'Plant Quality Director',
      resolution_notes: 'All corrective actions executed and verified on sample lot.'
    });
    assert.strictEqual(resolveRes.status, 200);
    console.log('✓ Status transition to VERIFIED_CLOSED passed');

    console.log('=======================================================');
    console.log(' ALL 15 AUTOMATED SYSTEM TESTS COMPLETED SUCCESSFULLY! ');
    console.log('=======================================================');
  } catch (err) {
    console.error('Test failed with error:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
