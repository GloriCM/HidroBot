import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clientIp } from '../src/lib/clientIp.js'

test('clientIp prioriza CF-Connecting-IP', () => {
  const ip = clientIp({
    headers: {
      'cf-connecting-ip': '203.0.113.9',
      'x-forwarded-for': '10.0.0.1, 10.0.0.2',
    },
    ip: '127.0.0.1',
  })
  assert.equal(ip, '203.0.113.9')
})

test('clientIp usa el primer X-Forwarded-For si no hay CF', () => {
  const ip = clientIp({
    headers: {
      'x-forwarded-for': '198.51.100.4, 10.0.0.1',
    },
    ip: '127.0.0.1',
  })
  assert.equal(ip, '198.51.100.4')
})

test('clientIp cae a request.ip', () => {
  const ip = clientIp({
    headers: {},
    ip: '127.0.0.1',
  })
  assert.equal(ip, '127.0.0.1')
})
