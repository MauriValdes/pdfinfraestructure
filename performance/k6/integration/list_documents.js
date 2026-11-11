// =============================================================================
// k6 — Escenario 2: Listado de documentos (GET /documents)
//
// Endpoint: GET /documents (MS1 -> MS3)
// Descripci\u00f3n: Eval\u00faa la lectura de la colecci\u00f3n de documentos.
// No modifica datos.
// Uso:
//   k6 run -e BASE_URL=http://localhost:8003 list_documents.js
// =============================================================================
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:8003';

function parsePositiveInt(envValue, fallback) {
  const v = parseInt(envValue, 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function parsePositiveDuration(envValue, fallback) {
  return envValue && envValue.trim() !== '' ? envValue : fallback;
}

export const options = {
  vus: parsePositiveInt(__ENV.VUS, 1),
  duration: parsePositiveDuration(__ENV.DURATION, '30s'),
  tags: { scenario: 'list_documents' },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<3000'],
  },
};

const errorRate = new Rate('list_errors');

export default function () {
  const res = http.get(`${BASE_URL}/documents`, {
    tags: { name: 'GET /documents' },
  });

  const ok = check(res, {
    'status 200': (r) => r.status === 200,
    'cuerpo es array': (r) => {
      try {
        return Array.isArray(r.json());
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
