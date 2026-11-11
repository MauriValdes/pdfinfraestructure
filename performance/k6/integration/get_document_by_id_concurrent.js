// =============================================================================
// k6 — Lectura pura por ID (concurrente)
//
// Endpoint: GET /documents/{DOC_ID} (MS1 -> MS3)
// Descripción: Consulta un documento preexistente por su ID con múltiples VUs.
// Todos los VUs consultan el mismo documento. Solo realiza solicitudes GET.
// No crea, modifica ni elimina documentos.
// Uso:
//   k6 run -e BASE_URL=http://localhost:8003 -e DOC_ID=<id> -e VUS=5 -e DURATION=60s performance/k6/get_document_by_id_concurrent.js
// =============================================================================
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:8003';
export const DOC_ID = __ENV.DOC_ID;

export const options = {
  vus: parseInt(__ENV.VUS, 10) || 5,
  duration: __ENV.DURATION || '60s',
  tags: { scenario: 'get_document_by_id_concurrent' },
  thresholds: {
    http_req_failed: ['rate<0.10'],
    http_req_duration: ['p(95)<5000'],
  },
};

const errorRate = new Rate('get_document_by_id_concurrent_errors');

export function setup() {
  if (!DOC_ID || DOC_ID.trim() === '') {
    throw new Error(
      'DOC_ID es obligatorio y no puede estar vacío. Ejemplo: k6 run -e BASE_URL=http://localhost:8003 -e DOC_ID=<id> -e VUS=5 -e DURATION=60s performance/k6/get_document_by_id_concurrent.js'
    );
  }
  return { docId: DOC_ID.trim() };
}

export default function (data) {
  const res = http.get(`${BASE_URL}/documents/${data.docId}`, {
    tags: { name: 'GET /documents/{id}' },
  });

  const ok = check(res, {
    'GET status 200': (r) => r.status === 200,
    'GET devuelve mismo id': (r) => {
      try {
        return r.json().id === data.docId;
      } catch (e) {
        return false;
      }
    },
  });

  if (!ok) {
    errorRate.add(1);
  } else {
    errorRate.add(0);
  }

  sleep(1);
}
