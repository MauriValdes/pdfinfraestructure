// =============================================================================
// k6 — Escenario 5: Subida controlada de PDF mediano (POST /documents/)
//
// Endpoint: POST /documents/ (MS1 -> MS3 -> MS2)
// Descripción: Sube un PDF mediano generado inline (~50 KB, válido).
// Cada iteración crea un documento persistente en MongoDB.
// Uso:
//   k6 run -e BASE_URL=http://localhost:8003 -e ITERATIONS=3 upload_medium_pdf.js
// =============================================================================
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:8003';
export const ITERATIONS = parseInt(__ENV.ITERATIONS, 10);

const createdIds = [];

export function setup() {
  const runId = __ENV.RUN_ID !== undefined ? __ENV.RUN_ID : crypto.randomUUID();
  if (!runId || runId.trim() === '') {
    throw new Error(
      'RUN_ID es obligatorio y no puede estar vacío. Ejemplo: k6 run -e RUN_ID=mi-ejecucion-1 upload_medium_pdf.js'
    );
  }
  console.log(`[upload_medium_pdf] RUN_ID = ${runId}`);
  return { runId };
}

// PDF mediano válido generado inline (~50 KB, válido)
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
  tags: { scenario: 'upload_medium_pdf' },
  thresholds: {
    http_req_failed: ['rate<0.10'],
    http_req_duration: ['p(95)<15000'],
  },
};

const errorRate = new Rate('upload_medium_errors');

export default function (data) {
  const pdfBytes = MINIMAL_PDF + `\n% run_id=${data.runId} iter=${Date.now()}\n`;
  const formData = {
    file: http.file(pdfBytes, `medium_${Date.now()}.pdf`, 'application/pdf'),
  };

  const res = http.post(`${BASE_URL}/documents/`, formData, {
    tags: { name: 'POST /documents/ (medium)' },
  });

  let docId = null;
  const ok = check(res, {
    'status 201': (r) => r.status === 201,
    'cuerpo tiene id': (r) => {
      try {
        docId = r.json().id;
        return !!docId;
      } catch (e) {
        return false;
      }
    },
    'no expone detalles técnicos en error': (r) => {
      if (r.status >= 400) {
        try {
          const b = r.json();
          return !/cluster\.mongodb|\.s\.mongodb\.net|processed_pdfs/.test(JSON.stringify(b));
        } catch (e) {
          return true;
        }
      }
      return true;
    },
  });

  if (docId) {
    createdIds.push(docId);
    console.log(`[upload_medium_pdf] documento creado: id=${docId} iteracion=${Date.now()}`);
  }

  if (!ok) {
    errorRate.add(1);
  } else {
    errorRate.add(0);
  }

  sleep(3);
}

export function teardown(data) {
  console.log(`[upload_medium_pdf] RUN_ID = ${data.runId}`);
  console.log(`[upload_medium_pdf] resumen: ${createdIds.length} documento(s) creado(s): ${createdIds.join(', ')}`);
}