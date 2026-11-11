// =============================================================================
// k6 — Estrés progresivo de lecturas (escenario 8: 10 → 25 → 50 VUs)
//
// Endpoints: GET /health  y  GET /documents (MS1 -> MS3)
// Descripción: Ejecuta una progresión gradual de carga de lecturas sobre MS1.
// Etapa 1: 10 VUs, Etapa 2: 25 VUs, Etapa 3: 50 VUs.
// Únicamente operaciones de lectura; no crea, modifica ni elimina documentos.
// Uso:
//   k6 run -e BASE_URL=http://localhost:8003 stress_progressive.js
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

const VUS_STAGE_1 = parsePositiveInt(__ENV.VUS_STAGE_1, 10);
const VUS_STAGE_2 = parsePositiveInt(__ENV.VUS_STAGE_2, 25);
const VUS_STAGE_3 = parsePositiveInt(__ENV.VUS_STAGE_3, 50);
const DURATION_STAGE_1 = parsePositiveDuration(__ENV.DURATION_STAGE_1, '30s');
const DURATION_STAGE_2 = parsePositiveDuration(__ENV.DURATION_STAGE_2, '30s');
const DURATION_STAGE_3 = parsePositiveDuration(__ENV.DURATION_STAGE_3, '30s');

export const options = {
  scenarios: {
    stress_progressive: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: DURATION_STAGE_1, target: VUS_STAGE_1 },
        { duration: DURATION_STAGE_2, target: VUS_STAGE_2 },
        { duration: DURATION_STAGE_3, target: VUS_STAGE_3 },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<5000'],
  },
  tags: { scenario: 'stress_progressive' },
};

const errorRate = new Rate('stress_progressive_errors');

export default function () {
  // 70% healthcheck (lectura pura, sin persistencia), 30% listado de documentos
  if (Math.random() < 0.70) {
    const res = http.get(`${BASE_URL}/health`, {
      tags: { name: 'GET /health' },
    });
    const ok = check(res, {
      'health status 200': (r) => r.status === 200,
      'health cuerpo status ok': (r) => {
        try {
          return r.json().status === 'ok';
        } catch (e) {
          return false;
        }
      },
    });
    if (!ok) errorRate.add(1); else errorRate.add(0);
  } else {
    const res = http.get(`${BASE_URL}/documents`, {
      tags: { name: 'GET /documents' },
    });
    const ok = check(res, {
      'documents status 200': (r) => r.status === 200,
      'documents cuerpo es array': (r) => {
        try {
          return Array.isArray(r.json());
        } catch (e) {
          return false;
        }
      },
    });
    if (!ok) errorRate.add(1); else errorRate.add(0);
  }

  sleep(1);
}
