import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { mqttIdFromMac } from '../src/lib/deviceIdentity.js'

describe('deviceIdentity', () => {
  test('mqttIdFromMac usa últimos 6 hex', () => {
    assert.equal(mqttIdFromMac('80:f3:da:54:2c:fc'), 'hb-542cfc')
    assert.equal(mqttIdFromMac('aa:bb:cc:dd:ee:ff'), 'hb-ddeeff')
  })
})