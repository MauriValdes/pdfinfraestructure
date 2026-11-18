// =============================================================================
// k6 — Escenario 5: Subida controlada de PDF mediano (POST /documents/)
//
// Endpoint: POST /documents/ (MS1 -> MS3 -> MS2)
// Descripción: Sube un PDF mediano generado inline (~50 KB, válido).
// Cada iteración crea un documento persistente en MongoDB.
// Uso:
//   k6 run -e BASE_URL=http://localhost:8080 -e ITERATIONS=3 upload_medium_pdf.js
// =============================================================================
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
export const ITERATIONS = parseInt(__ENV.ITERATIONS, 10);

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
  // Mantener el fixture en ~50 KiB sin alterar la estructura ni los offsets
  // xref del PDF: el padding es un comentario antes del marcador %%EOF.
  const targetBytes = 50 * 1024;
  const pdfPrefix = MINIMAL_PDF.slice(0, MINIMAL_PDF.lastIndexOf('%%EOF'));
  const xrefMarker = '\nxref\n';
  const xrefMarkerIndex = pdfPrefix.lastIndexOf(xrefMarker);
  if (xrefMarkerIndex < 0) {
    throw new Error('El PDF base no contiene una tabla xref');
  }
  const xrefOffset = xrefMarkerIndex + 1;
  const startxrefPattern = /startxref\n\d+\n$/;
  if (!startxrefPattern.test(pdfPrefix)) {
    throw new Error('El PDF base no contiene un valor startxref válido');
  }
  const correctedPdfPrefix = pdfPrefix.replace(
    startxrefPattern,
    `startxref\n${xrefOffset}\n`
  );
  const startxrefIndex = correctedPdfPrefix.lastIndexOf('startxref\n');
  if (startxrefIndex < 0) {
    throw new Error('No se pudo localizar el bloque startxref corregido');
  }
  const pdfBeforeStartxref = correctedPdfPrefix.slice(0, startxrefIndex);
  const startxrefSection = correctedPdfPrefix.slice(startxrefIndex);
  const runComment = `% run_id=${data.runId} iter=${Date.now()}`;
  const paddingMarker = '% payload=';
  const fixedLength =
    pdfBeforeStartxref.length +
    runComment.length +
    1 + // newline before the padding comment
    paddingMarker.length +
    1 + // newline before %%EOF
    startxrefSection.length +
    '%%EOF'.length;
  const paddingLength = Math.max(0, targetBytes - fixedLength);
  const pdfBytes =
    `${pdfBeforeStartxref}${runComment}\n${paddingMarker}` +
    `${'x'.repeat(paddingLength)}\n${startxrefSection}%%EOF`;
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
  console.log('[upload_medium_pdf] los IDs creados se registran en los logs de cada iteración');
}
