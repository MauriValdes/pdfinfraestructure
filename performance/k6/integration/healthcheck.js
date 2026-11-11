// =============================================================================
// k6 — Escenario 1: Healthcheck de MS1
//
// Endpoint: GET /health (MS1, publicado en http://localhost:8003)
// Descripci\u00f3n: Mide la latencia del healthcheck b\u00e1sico de liveness del
// gateway. No persiste datos ni invoca a MS3/MS2.
// Uso:
//   k6 run -e BASE_URL=http://localhost:8003 healthcheck.js
// =============================================================================
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:8003';

export const options = {
  // Baseline: 1 VU constante, duraci\u00f3n corta
  vus: 1,
  duration: '30s',
  tags: { scenario: 'healthcheck' },
  // Umbrales iniciales conservadores (s\u00f3lo referencia, sin baseline a\u00fan)
  thresholds: {
    http_req_failed: ['rate<0.01'], // menos del 1% de fallos
    http_req_duration: ['p(95)<2000'], // p95 menor a 2s
  },
};

// Error rate personalizado para el healthcheck
const errorRate = new Rate('healthcheck_errors');

export default function () {
  const res = http.get(`${BASE_URL}/health`, {
    tags: { name: 'Healthcheck MS1' },
  });

  // Check: c\u00f3digo 200 y cuerpo esperado
  const ok = check(res, {
    'status 200': (r) => r.status === 200,
    'cuerpo status ok': (r) => {
      try {
        const b = r.json();
        return b.status === 'ok';
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
