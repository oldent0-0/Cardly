import assert from 'node:assert/strict'
import test from 'node:test'
import { ApiError } from '../src/lib/api.ts'
import { translate, translateError } from '../src/lib/i18n.ts'

test('translates interface text and interpolates Mongolian values', () => {
  assert.equal(translate('en', 'signIn'), 'Sign in')
  assert.equal(translate('mn', 'signIn'), 'Нэвтрэх')
  assert.equal(translate('mn', 'cardsReady', { count: 3 }), '3 карт бэлэн')
})

test('localizes API errors and fallbacks', () => {
  const t = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) => translate('mn', key, values)

  assert.equal(translateError(new ApiError('That email and password do not match.', 401), t, 'pleaseTryAgain'), 'Имэйл хаяг болон нууц үг таарахгүй байна.')
  assert.equal(translateError(new Error('offline'), t, 'couldNotSaveCard'), 'Карт хадгалж чадсангүй.')
})
