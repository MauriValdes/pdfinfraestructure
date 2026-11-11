// =============================================================================
// k6 — Escenario 3: Consulta de documento por ID (GET /documents/{id})
//
// Endpoint: GET /documents/{document_id} (MS1 -> MS3)
// Descripci\u00f3n: Crea un documento (POST) y luego lo consulta por ID.
// \u00danicamente opera sobre documentos creados por el propio test.
// Uso:
//   k6 run -e BASE_URL=http://localhost:8003 -e ITERATIONS=5 get_document_by_id.js
// =============================================================================
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

function parsePositiveInt(envValue, fallback) {
  const v = parseInt(envValue, 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:8003';
export const ITERATIONS = parsePositiveInt(__ENV.ITERATIONS, 5);

const createdIds = [];

export function setup() {
  const runId = __ENV.RUN_ID !== undefined ? __ENV.RUN_ID : crypto.randomUUID();
  if (!runId || runId.trim() === '') {
    throw new Error(
      'RUN_ID es obligatorio y no puede estar vacío. Ejemplo: k6 run -e RUN_ID=mi-ejecucion-1 get_document_by_id.js'
    );
  }
  console.log(`[get_document_by_id] RUN_ID = ${runId}`);
  return { runId };
}

// PDF m\u00ednimo v\u00e1lido generado inline
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
  tags: { scenario: 'get_document_by_id' },
  thresholds: {
    http_req_failed: ['rate<0.10'],
    http_req_duration: ['p(95)<5000'],
  },
};

const errorRate = new Rate('get_by_id_errors');

export default function (data) {
  // Paso 1: Crear documento (POST) para obtener un ID v\u00e1lido propio
  const pdfBytes = MINIMAL_PDF + `\n% run_id=${data.runId} iter=${Date.now()}\n`;
  const formData = {
    file: http.file(pdfBytes, `test_${Date.now()}.pdf`, 'application/pdf'),
  };
  const postRes = http.post(`${BASE_URL}/documents/`, formData, {
    tags: { name: 'POST /documents/' },
  });

  const postOk = check(postRes, {
    'POST status 201': (r) => r.status === 201,
    'POST devuelve id': (r) => {
      try {
        return !!r.json().id;
      } catch (e) {
        return false;
      }
    },
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
  console.log(`[get_document_by_id] documento creado: id=${docId} iteracion=${Date.now()}`);

  // Paso 2: Consultar el documento creado por su ID
  const getRes = http.get(`${BASE_URL}/documents/${docId}`, {
    tags: { name: 'GET /documents/{id}' },
  });

  const getOk = check(getRes, {
    'GET status 200': (r) => r.status === 200,
    'GET devuelve mismo id': (r) => {
      try {
        return r.json().id === docId;
      } catch (e) {
        return false;
      }
    },
  });

  if (!getOk) {
    errorRate.add(1);
  } else {
    errorRate.add(0);
  }

  sleep(1);
}

export function teardown(data) {
  console.log(`[get_document_by_id] RUN_ID = ${data.runId}`);
  console.log(`[get_document_by_id] resumen: ${createdIds.length} documento(s) creado(s): ${createdIds.join(', ')}`);
}
