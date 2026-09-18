import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ADDON_API_VERSION,
  compatibleAddonManifest,
} from '../src/addons/api.ts'

test('addon manifests require release versions while accepting versioned v1 packages', () => {
  assert.equal(ADDON_API_VERSION, 2)
  for (const apiVersion of [1, ADDON_API_VERSION]) {
    assert.equal(
      compatibleAddonManifest({ apiVersion, version: '1.0.0' }),
      true,
    )
    for (const version of [undefined, null, '', '  ', 1, 'x'.repeat(41)])
      assert.equal(compatibleAddonManifest({ apiVersion, version }), false)
  }
  for (const apiVersion of [0, 3, '2', undefined])
    assert.equal(
      compatibleAddonManifest({ apiVersion, version: '1.0.0' }),
      false,
    )
})
