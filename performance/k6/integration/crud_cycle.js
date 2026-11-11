// =============================================================================
// k6 — Escenario 8: Ciclo CRUD controlado (crear -> PATCH -> DELETE)
//
// Endpoints: POST /documents/ , PATCH /documents/{id} , DELETE /documents/{id}
// Descripción: Crea un documento, lo actualiza (PATCH) y lo elimina (DELETE).
// Únicamente opera sobre documentos creados por el propio test.
// No afecta documentos ajenos.
// Uso:
//   k6 run -e BASE_URL=http://localhost:8003 -e ITERATIONS=3 crud_cycle.js
// =============================================================================
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:8003';
export const ITERATIONS = parseInt(__ENV.ITERATIONS, 10);

const createdIds = [];
const deletedIds = [];

export function setup() {
  const runId = __ENV.RUN_ID !== undefined ? __ENV.RUN_ID : crypto.randomUUID();
  if (!runId || runId.trim() === '') {
    throw new Error(
      'RUN_ID es obligatorio y no puede estar vacío. Ejemplo: k6 run -e RUN_ID=mi-ejecucion-1 crud_cycle.js'
    );
  }
  console.log(`[crud_cycle] RUN_ID = ${runId}`);
  return { runId };
}

// PDF mínimo válido generado inline
const MINIMAL_PDF = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>
endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
trailer
<< /Size 4 /Root 1 0 R >>
startxref
178
%%EOF`;

export const options = {
  vus: 1,
  iterations: ITERATIONS,
  tags: { scenario: 'crud_cycle' },
  thresholds: {
    http_req_failed: ['rate<0.10'],
    http_req_duration: ['p(95)<10000'],
  },
};

const errorRate = new Rate('crud_cycle_errors');

export default function (data) {
  // Paso 1: Crear (POST)
  const pdfBytes = MINIMAL_PDF + `\n% run_id=${data.runId} iter=${Date.now()}\n`;
  const formData = {
    file: http.file(pdfBytes, `crud_${Date.now()}.pdf`, 'application/pdf'),
  };
  const postRes = http.post(`${BASE_URL}/documents/`, formData, {
    tags: { name: 'POST /documents/' },
  });

  const postOk = check(postRes, {
    'POST status 201': (r) => r.status === 201,
  });

  if (!postOk) {
    errorRate.add(1);
    return;
  }

  let docId;
  try {
    docId = postRes.json().id;
  } catch (e) {
    errorRate.add(1);
    return;
  }

  createdIds.push(docId);
  console.log(`[crud_cycle] documento creado: id=${docId} iteracion=${Date.now()}`);

  // Paso 2: Actualizar parcialmente (PATCH) con campos válidos
  const patchRes = http.patch(`${BASE_URL}/documents/${docId}`, JSON.stringify({
    status: 'completed',
    content: 'Texto de prueba actualizado',
    page_count: 1,
  }), {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'PATCH /documents/{id}' },
  });

  const patchOk = check(patchRes, {
    'PATCH status 200': (r) => r.status === 200,
  });

  if (!patchOk) {
    errorRate.add(1);
  } else {
    errorRate.add(0);
  }

  // Paso 3: Eliminar (DELETE)
  const delRes = http.del(`${BASE_URL}/documents/${docId}`, null, {
    tags: { name: 'DELETE /documents/{id}' },
  });

  const delOk = check(delRes, {
    'DELETE status 204': (r) => r.status === 204,
  });

  if (delOk && docId) {
    deletedIds.push(docId);
    console.log(`[crud_cycle] documento eliminado: id=${docId} iteracion=${Date.now()}`);
  }

  if (!delOk) {
    errorRate.add(1);
  } else {
    errorRate.add(0);
  }

  sleep(2);
}

export function teardown(data) {
  const remaining = createdIds.filter(id => !deletedIds.includes(id));
  console.log(`[crud_cycle] RUN_ID = ${data.runId}`);
  console.log(`[crud_cycle] resumen: ${createdIds.length} creado(s), ${deletedIds.length} eliminado(s)`);
  console.log(`[crud_cycle] creados: ${createdIds.join(', ')}`);
  console.log(`[crud_cycle] eliminados: ${deletedIds.join(', ')}`);
  if (remaining.length > 0) {
    console.log(`[crud_cycle] ADVERTENCIA: documentos no eliminados (quedaron en BD): ${remaining.join(', ')}`);
  }
}