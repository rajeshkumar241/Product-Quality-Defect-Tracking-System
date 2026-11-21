const { db, logAudit } = require('./database');
const crypto = require('node:crypto');

function seedDatabase() {
  console.log('--- Seeding Product Quality & Defect Tracking Database ---');

  // Clear existing data in reverse foreign key order
  db.exec(`
    DELETE FROM defect_comments;
    DELETE FROM audit_logs;
    DELETE FROM defect_capa;
    DELETE FROM defect_rca;
    DELETE FROM defects;
    DELETE FROM inspection_checkpoints;
    DELETE FROM production_batches;
    DELETE FROM products;
  `);

  // 1. Seed Products
  const products = [
    {
      id: 'PROD-001',
      sku: 'AERO-TB-700',
      name: 'High-Pressure Turbine Blade Titanium',
      category: 'Aerospace Propulsion',
      description: 'Single crystal titanium alloy turbine blade for high-thrust jet engines.',
      target_fpy: 99.2
    },
    {
      id: 'PROD-002',
      sku: 'AUTO-ECU-V4',
      name: 'Automotive Powertrain Controller Board (ECU)',
      category: 'Automotive Electronics',
      description: 'Dual-core automotive grade engine & hybrid drive management ECU.',
      target_fpy: 98.8
    },
    {
      id: 'PROD-003',
      sku: 'MED-SYR-500',
      name: 'Precision Infusion Syringe Driver Unit',
      category: 'Medical Devices',
      description: 'Class II medical syringe pump with micro-stepper motor accuracy.',
      target_fpy: 99.5
    },
    {
      id: 'PROD-004',
      sku: 'BATT-EV-800V',
      name: '800V Ultra-Fast Battery Module Matrix',
      category: 'Energy & EV Systems',
      description: 'High-density NMC cylindrical cell module with integrated liquid cooling plate.',
      target_fpy: 97.5
    }
  ];

  const insertProd = db.prepare(`
    INSERT INTO products (id, sku, name, category, description, target_fpy)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const p of products) {
    insertProd.run(p.id, p.sku, p.name, p.category, p.description, p.target_fpy);
  }

  // 2. Seed Inspection Checkpoints
  const checkpoints = [
    {
      id: 'CHK-INC-01',
      name: 'Raw Material Chemical & Spectrometry Purity',
      stage: 'INCOMING_MATERIALS',
      criteria: 'Alloy purity >= 99.94%, no carbon inclusion or porosity detected via optical emission spectroscopy.',
      severity_default: 'CRITICAL'
    },
    {
      id: 'CHK-PRC-02',
      name: 'High-Speed CNC Milling Geometric Tolerancing (GD&T)',
      stage: 'IN_PROCESS',
      criteria: 'Profile of a surface within ±0.015mm, runout <= 0.008mm checked on CMM.',
      severity_default: 'MAJOR'
    },
    {
      id: 'CHK-PRC-03',
      name: 'SMT Solder Paste & Automated Optical Inspection (AOI)',
      stage: 'IN_PROCESS',
      criteria: 'Zero solder bridging, tombstoning, or pin misalignment on QFP/BGA footprints.',
      severity_default: 'CRITICAL'
    },
    {
      id: 'CHK-ASM-04',
      name: 'Ultrasonic Weld & Hermetic Seal Verification',
      stage: 'FINAL_ASSEMBLY',
      criteria: 'Helium mass spectrometer leak rate < 1.0 x 10^-7 mbar*l/s.',
      severity_default: 'CRITICAL'
    },
    {
      id: 'CHK-OUT-05',
      name: 'Outgoing Functional Burn-In & Dielectric Withstand Test',
      stage: 'OUTGOING_QC',
      criteria: 'Hi-Pot test at 2500V AC for 60s, insulation resistance > 100 Megaohms.',
      severity_default: 'CRITICAL'
    },
    {
      id: 'CHK-OUT-06',
      name: 'Packaging Seal Integrity & Barcode Traceability',
      stage: 'OUTGOING_QC',
      criteria: 'Peel force between 1.8N - 3.2N, GS1-128 barcode grading Grade A or B.',
      severity_default: 'MINOR'
    }
  ];

  const insertChk = db.prepare(`
    INSERT INTO inspection_checkpoints (id, name, stage, criteria, severity_default)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const c of checkpoints) {
    insertChk.run(c.id, c.name, c.stage, c.criteria, c.severity_default);
  }

  // 3. Seed Production Batches
  const batches = [
    {
      id: 'BATCH-2026-A1',
      batch_number: 'B-TB-2026-088',
      product_id: 'PROD-001',
      units_produced: 1200,
      units_inspected: 1200,
      units_passed: 1184,
      units_failed: 16,
      manufacturing_line: 'Line A (Precision Machining Center 3)',
      status: 'QC_INSPECTION'
    },
    {
      id: 'BATCH-2026-A2',
      batch_number: 'B-ECU-2026-104',
      product_id: 'PROD-002',
      units_produced: 5000,
      units_inspected: 5000,
      units_passed: 4945,
      units_failed: 55,
      manufacturing_line: 'Line C (SMT High-Speed Surface Mount)',
      status: 'IN_PRODUCTION'
    },
    {
      id: 'BATCH-2026-A3',
      batch_number: 'B-SYR-2026-032',
      product_id: 'PROD-003',
      units_produced: 850,
      units_inspected: 850,
      units_passed: 847,
      units_failed: 3,
      manufacturing_line: 'Cleanroom ISO-7 Cell 1',
      status: 'COMPLETED'
    },
    {
      id: 'BATCH-2026-A4',
      batch_number: 'B-BAT-2026-019',
      product_id: 'PROD-004',
      units_produced: 640,
      units_inspected: 640,
      units_passed: 618,
      units_failed: 22,
      manufacturing_line: 'EV Pack Automated Gantry 2',
      status: 'QUARANTINED'
    }
  ];

  const insertBatch = db.prepare(`
    INSERT INTO production_batches (id, batch_number, product_id, units_produced, units_inspected, units_passed, units_failed, manufacturing_line, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const b of batches) {
    insertBatch.run(b.id, b.batch_number, b.product_id, b.units_produced, b.units_inspected, b.units_passed, b.units_failed, b.manufacturing_line, b.status);
  }

  // 4. Seed Defects
  const defects = [
    {
      id: 'DEF-2026-101',
      title: 'Micro-fracture along airfoil root fillet under UV fluorescent penetrant',
      description: 'Fluorescent Penetrant Inspection (FPI) revealed 0.45mm linear micro-crack indications along the concave root transition radius of turbine blades.',
      product_id: 'PROD-001',
      batch_id: 'BATCH-2026-A1',
      checkpoint_id: 'CHK-PRC-02',
      defect_type: 'STRUCTURAL',
      severity: 'CRITICAL',
      priority: 'P1_URGENT',
      status: 'CAPA_PENDING',
      discovered_by: 'Marcus Vance (Senior NDT Inspector)',
      assigned_to: 'Dr. Sarah Lin (Lead Metallurgical QA Engineer)',
      containment_action: 'Immediate quarantine of lot B-TB-2026-088. CNC Spindle #4 halted from operation.',
      resolution_notes: null
    },
    {
      id: 'DEF-2026-102',
      title: 'Solder bridging across pins 14-16 on Main Microcontroller IC',
      description: 'AOI inspection flagged solder bridges on pitch 0.5mm automotive microcontroller leads on ECU boards, causing potential short between CAN-High and VDD.',
      product_id: 'PROD-002',
      batch_id: 'BATCH-2026-A2',
      checkpoint_id: 'CHK-PRC-03',
      defect_type: 'ELECTRICAL',
      severity: 'MAJOR',
      priority: 'P2_HIGH',
      status: 'RCA_COMPLETED',
      discovered_by: 'Elena Rostova (SMT Quality Specialist)',
      assigned_to: 'Kenji Takahashi (Process Quality Engineer)',
      containment_action: 'Laser rework station deployed; 100% manual microscope inspection on SMT output line.',
      resolution_notes: null
    },
    {
      id: 'DEF-2026-103',
      title: 'Dielectric insulation breakdown during 2500V Hi-Pot stress test',
      description: 'Thermal interface silicone pad between cell group 4 and the liquid cold plate ruptured under compression, triggering current arcing at 1800V.',
      product_id: 'PROD-004',
      batch_id: 'BATCH-2026-A4',
      checkpoint_id: 'CHK-OUT-05',
      defect_type: 'ELECTRICAL',
      severity: 'CRITICAL',
      priority: 'P1_URGENT',
      status: 'UNDER_INVESTIGATION',
      discovered_by: 'David Chen (EV Safety Compliance Tester)',
      assigned_to: 'Amara Okafor (High Voltage Systems QA Lead)',
      containment_action: 'Batch quarantined. Hi-Pot voltage threshold ramp tests halted pending dielectric pad batch inspection.',
      resolution_notes: null
    },
    {
      id: 'DEF-2026-104',
      title: 'Stepping motor lead screw axial backlash exceeded tolerance',
      description: 'Syringe driver encoder detected 0.042mm backlash (spec limit <= 0.015mm), threatening micro-infusion delivery rate accuracy.',
      product_id: 'PROD-003',
      batch_id: 'BATCH-2026-A3',
      checkpoint_id: 'CHK-PRC-02',
      defect_type: 'DIMENSIONAL',
      severity: 'MAJOR',
      priority: 'P2_HIGH',
      status: 'VERIFIED_CLOSED',
      discovered_by: 'Rachel Green (Cleanroom QC Tech)',
      assigned_to: 'Tom Hansen (Precision Mechanics QA)',
      containment_action: '3 affected units isolated and disassembled. Preload spring tension measured.',
      resolution_notes: 'Root cause identified as supplier spring batch tension variance. Supplier replaced lot with certified tolerance spring batches. Recalibrated units passed 72-hour continuous dose run.'
    },
    {
      id: 'DEF-2026-105',
      title: 'Sterility pouch heat seal peel strength marginal at 1.42 N/15mm',
      description: 'Destructive seal peel testing on pouch specimens fell slightly below the 1.50 N ISO-11607 requirement.',
      product_id: 'PROD-003',
      batch_id: 'BATCH-2026-A3',
      checkpoint_id: 'CHK-OUT-06',
      defect_type: 'PACKAGING',
      severity: 'MINOR',
      priority: 'P3_MEDIUM',
      status: 'RESOLVED',
      discovered_by: 'Rachel Green (Cleanroom QC Tech)',
      assigned_to: 'Tom Hansen (Precision Mechanics QA)',
      containment_action: 'Thermal sealing jaw thermocouple recalibrated; dwell time increased from 0.8s to 1.1s.',
      resolution_notes: 'Follow-up retest of 25 consecutive pouches yielded average 2.45 N peel strength with uniform hermetic transfer.'
    },
    {
      id: 'DEF-2026-106',
      title: 'Surface anodizing pitting and patchy color dispersion on side rail',
      description: 'Cosmetic visual audit identified micro-pitting and non-uniform titanium grey anodized coat on exterior housing.',
      product_id: 'PROD-001',
      batch_id: 'BATCH-2026-A1',
      checkpoint_id: 'CHK-INC-01',
      defect_type: 'SURFACE_FINISH',
      severity: 'MINOR',
      priority: 'P4_LOW',
      status: 'NEW',
      discovered_by: 'Marcus Vance (Senior NDT Inspector)',
      assigned_to: null,
      containment_action: 'Visual segregation of affected cosmetic housings.',
      resolution_notes: null
    }
  ];

  const insertDefect = db.prepare(`
    INSERT INTO defects (id, title, description, product_id, batch_id, checkpoint_id, defect_type, severity, priority, status, discovered_by, assigned_to, containment_action, resolution_notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const d of defects) {
    insertDefect.run(d.id, d.title, d.description, d.product_id, d.batch_id, d.checkpoint_id, d.defect_type, d.severity, d.priority, d.status, d.discovered_by, d.assigned_to, d.containment_action, d.resolution_notes);
    logAudit('DEFECT', d.id, 'CREATED', d.discovered_by, { title: d.title, severity: d.severity, priority: d.priority });
  }

  // 5. Seed Root Cause Analysis (5-Whys & Ishikawa)
  // RCA for DEF-2026-101 (Turbine micro-fracture)
  db.prepare(`
    INSERT INTO defect_rca (id, defect_id, fishbone_category, why_1, why_2, why_3, why_4, why_5, root_cause_conclusion, analyzed_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'RCA-101',
    'DEF-2026-101',
    'MACHINE',
    'Why 1: Why did micro-cracks form along the airfoil fillet? High localized cyclic stress occurred during high-speed rough milling.',
    'Why 2: Why was localized stress elevated? CNC Spindle #4 exhibited harmonic chatter vibration exceeding 3.8 mm/s RMS.',
    'Why 3: Why was the spindle vibrating abnormally? The ceramic hybrid rear duplex bearing had suffered micro-flaking and lost preload stiffness.',
    'Why 4: Why was bearing degradation not caught earlier? Spindle maintenance was scheduled by elapsed calendar days rather than actual continuous spindle cutting hours.',
    'Why 5: Why were cutting hours not tracked? Predictive vibration sensors were installed but not connected to the SCADA maintenance alarm trigger.',
    'Conclusion: Machine vibration caused by degraded spindle bearings created tool chatter stress concentrations, escaping detection due to missing real-time accelerometer threshold triggers.',
    'Dr. Sarah Lin (Lead Metallurgical QA Engineer)'
  );
  logAudit('RCA', 'RCA-101', 'RCA_UPDATED', 'Dr. Sarah Lin', { defect_id: 'DEF-2026-101', fishbone_category: 'MACHINE' });

  // RCA for DEF-2026-102 (ECU Solder bridging)
  db.prepare(`
    INSERT INTO defect_rca (id, defect_id, fishbone_category, why_1, why_2, why_3, why_4, why_5, root_cause_conclusion, analyzed_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'RCA-102',
    'DEF-2026-102',
    'METHOD',
    'Why 1: Why did solder bridge across pins 14-16? Excessive solder paste volume remained on the stencil apertures after wipe cycle.',
    'Why 2: Why was paste volume excessive? Stencil wipe solvent roll became dry during the 3rd shift run.',
    'Why 3: Why was the solvent roll dry? Automated solvent dispenser pump nozzle had a partial flux residue clog.',
    'Why 4: Why was nozzle clogging not detected? No fluid flow rate sensor was integrated on the solvent feed tube.',
    'Why 5: Why was inspection relying solely on visual post-reflow? Pre-reflow 3D Solder Paste Inspection (SPI) was bypassed in line bypass mode.',
    'Conclusion: Stencil cleaning nozzle clog resulted in un-wiped paste buildup, compounding with bypassed SPI inspection before reflow oven entry.',
    'Kenji Takahashi (Process Quality Engineer)'
  );
  logAudit('RCA', 'RCA-102', 'RCA_UPDATED', 'Kenji Takahashi', { defect_id: 'DEF-2026-102', fishbone_category: 'METHOD' });

  // 6. Seed Corrective and Preventive Actions (CAPA)
  const capas = [
    {
      id: 'CAPA-101-A',
      defect_id: 'DEF-2026-101',
      action_type: 'CORRECTIVE',
      description: 'Replace CNC Spindle #4 duplex bearing assembly and recalibrate dynamic runout to < 0.002mm.',
      owner: 'Robert Chen (Machine Maintenance Lead)',
      target_date: '2026-11-25',
      status: 'IN_PROGRESS',
      verification_notes: null
    },
    {
      id: 'CAPA-101-B',
      defect_id: 'DEF-2026-101',
      action_type: 'PREVENTIVE',
      description: 'Integrate IoT piezoelectric accelerometer on all CNC spindles with automatic feed-hold trip if vibration exceeds 2.0 mm/s.',
      owner: 'Dr. Sarah Lin & Automation Team',
      target_date: '2026-12-05',
      status: 'PLANNED',
      verification_notes: null
    },
    {
      id: 'CAPA-102-A',
      defect_id: 'DEF-2026-102',
      action_type: 'CORRECTIVE',
      description: 'Flush and ultrasonically clean stencil printer solvent dispensing nozzles; mandate ultrasonic bath cleaning every 12 hours.',
      owner: 'Elena Rostova',
      target_date: '2026-11-22',
      status: 'IMPLEMENTED',
      verification_notes: 'Solvent delivery rate restored to nominal 15ml/cycle.'
    },
    {
      id: 'CAPA-102-B',
      defect_id: 'DEF-2026-102',
      action_type: 'PREVENTIVE',
      description: 'Lock out line bypass interlock on SMT line: boards cannot enter reflow oven without 100% green flag from 3D SPI station.',
      owner: 'Kenji Takahashi',
      target_date: '2026-11-30',
      status: 'PLANNED',
      verification_notes: null
    },
    {
      id: 'CAPA-104-A',
      defect_id: 'DEF-2026-104',
      action_type: 'CORRECTIVE',
      description: 'Quarantine and return vendor spring lot #SP-992; update Incoming Goods receiving inspection with automated spring force deflection tester.',
      owner: 'Tom Hansen',
      target_date: '2026-11-15',
      status: 'VERIFIED',
      verification_notes: 'Supplier audited. Certificate of Conformance required per lot. Retest of 500 springs showed 100% compliance.'
    }
  ];

  const insertCapa = db.prepare(`
    INSERT INTO defect_capa (id, defect_id, action_type, description, owner, target_date, status, verification_notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const c of capas) {
    insertCapa.run(c.id, c.defect_id, c.action_type, c.description, c.owner, c.target_date, c.status, c.verification_notes);
    logAudit('CAPA', c.id, 'CAPA_ADDED', c.owner, { defect_id: c.defect_id, action_type: c.action_type, description: c.description });
  }

  // 7. Seed Comments
  const comments = [
    {
      defect_id: 'DEF-2026-101',
      author: 'Marcus Vance',
      comment: 'Penetrant indications were verified under 365nm UV LED at 1500 uW/cm2. Indications match class 3 fatigue propagation profile.'
    },
    {
      defect_id: 'DEF-2026-101',
      author: 'Dr. Sarah Lin',
      comment: 'SEM examination confirms micro-striations consistent with tool chatter. Containment is airtight; no blades from batch B-TB-2026-088 have been released to welding.'
    },
    {
      defect_id: 'DEF-2026-102',
      author: 'Elena Rostova',
      comment: 'Rework technician cleared 48 boards with micro-soldering station; all 48 passed post-rework ICT testing.'
    },
    {
      defect_id: 'DEF-2026-103',
      author: 'Amara Okafor',
      comment: 'Cold plate compression pressure on pack assembly line was recorded at 240 kPa vs 180 kPa max specification. Reviewing hydraulic press calibration sheet.'
    }
  ];

  const insertComment = db.prepare(`
    INSERT INTO defect_comments (defect_id, author, comment)
    VALUES (?, ?, ?)
  `);
  for (const c of comments) {
    insertComment.run(c.defect_id, c.author, c.comment);
  }

  console.log('--- Database Seeding Completed Successfully ---');
}

if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase };
