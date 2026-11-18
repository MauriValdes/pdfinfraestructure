// =============================================================================
// k6 — Escenario 7: Concurrencia mixta de operaciones de lectura
//
// Endpoints: GET /documents  y  GET /documents/{id}  (MS1 -> MS3)
// Descripci\u00f3n: Mezcla lecturas de listado y consulta individual.
// Los IDs usados son documentos creados por el propio test (no documentos
// preexistentes de la base).
// Uso:
//   k6 run -e BASE_URL=http://localhost:8080 -e VUS=20 -e DURATION=60s mixed_read_concurrency.js
// =============================================================================
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

function parsePositiveInt(envValue, fallback) {
  const v = parseInt(envValue, 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function parsePositiveDuration(envValue, fallback) {
  return envValue && envValue.trim() !== '' ? envValue : fallback;
}

// PDF m\u00ednimo v\u00e1lido generado inline (para crear documentos propios en setup)
const MINIMAL_PDF_TEMPLATE = `%PDF-1.4
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

function correctStartxref(pdf) {
  const eofIndex = pdf.lastIndexOf('%%EOF');
  if (eofIndex < 0) {
    throw new Error('El PDF base no contiene %%EOF');
  }
  const prefix = pdf.slice(0, eofIndex);
  const xrefMarkerIndex = prefix.lastIndexOf('\nxref\n');
  if (xrefMarkerIndex < 0) {
    throw new Error('El PDF base no contiene una tabla xref');
  }
  const xrefOffset = xrefMarkerIndex + 1;
  const startxrefPattern = /startxref\n\d+\n$/;
  if (!startxrefPattern.test(prefix)) {
    throw new Error('El PDF base no contiene un valor startxref válido');
  }
  return prefix.replace(startxrefPattern, `startxref\n${xrefOffset}\n`) + '%%EOF';
}

const MINIMAL_PDF = correctStartxref(MINIMAL_PDF_TEMPLATE);

export const options = {
  vus: parsePositiveInt(__ENV.VUS, 1),
  duration: parsePositiveDuration(__ENV.DURATION, '30s'),
  tags: { scenario: 'mixed_read_concurrency' },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<3000'],
  },
};

export function setup() {
  const runId = __ENV.RUN_ID !== undefined ? __ENV.RUN_ID : crypto.randomUUID();
  if (!runId || runId.trim() === '') {
    throw new Error(
      'RUN_ID es obligatorio y no puede estar vacío. Ejemplo: k6 run -e RUN_ID=mi-ejecucion-1 mixed_read_concurrency.js'
    );
  }
  console.log(`[mixed_read_concurrency] RUN_ID = ${runId}`);
  return { runId };
}

const errorRate = new Rate('mixed_read_errors');

// Almacena un ID de documento v\u00e1lido por VU (creado en la primera iteraci\u00f3n)
const docIdByVU = new Map();
const postAttemptedByVU = new Set();

export default function (data) {
  const vu = __VU;
  let postIdError = false;

  // Asegurar que este VU tiene un documento propio para consultar
  if (!docIdByVU.has(vu) && !postAttemptedByVU.has(vu)) {
    // Marcar antes del envío para no repetir un POST fallido o ambiguo.
    postAttemptedByVU.add(vu);
    const runComment = `% run_id=${data.runId} vu=${vu}`;
    const pdfBytes = MINIMAL_PDF.replace(
      'startxref\n',
      `\n${runComment}\nstartxref\n`
    );
    const formData = {
      file: http.file(pdfBytes, `mixed_vu_${vu}.pdf`, 'application/pdf'),
    };
    const postRes = http.post(`${BASE_URL}/documents/`, formData, {
      tags: { name: 'POST /documents/ (setup)' },
    });
    let docId = null;
    if (postRes.status === 201) {
      try {
        const payload = postRes.json();
        if (
          payload &&
          typeof payload === 'object' &&
          typeof payload.id === 'string' &&
          payload.id.trim() !== ''
        ) {
          docId = payload.id;
        }
      } catch (e) {
        // La respuesta no es JSON válido; se continuará con GET de listado.
      }
    }

    if (docId) {
      docIdByVU.set(vu, docId);
      console.log(
        `[mixed_read_concurrency] documento creado: RUN_ID=${data.runId} VU=${vu} id=${docId}`
      );
    } else {
      postIdError = true;
      console.error(
        `[mixed_read_concurrency] no se obtuvo un ID válido: RUN_ID=${data.runId} VU=${vu} HTTP=${postRes.status}; se usará GET de listado en esta iteración`
      );
    }
  }

  const docId = docIdByVU.get(vu);
  let getOk;

  // 70% listado, 30% consulta individual
  if (Math.random() < 0.70 && docId) {
    // GET /documents/{id}
    const res = http.get(`${BASE_URL}/documents/${docId}`, {
      tags: { name: 'GET /documents/{id}' },
    });
    const ok = check(res, {
      'GET by id status 200': (r) => r.status === 200,
    });
    getOk = ok;
  } else {
    // GET /documents (listado)
    const res = http.get(`${BASE_URL}/documents`, {
      tags: { name: 'GET /documents' },
    });
    const ok = check(res, {
      'GET list status 200': (r) => r.status === 200,
      'cuerpo es array': (r) => {
        try {
          return Array.isArray(r.json());
        } catch (e) {
          return false;
        }
      },
    });
    getOk = ok;
  }

  errorRate.add(postIdError || !getOk ? 1 : 0);
  sleep(1);
}
