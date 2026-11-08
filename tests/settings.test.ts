import { expect, test } from 'claude-code/testing'

import {
  DEFAULT_INTERVAL_MINUTES,
  DEFAULT_WAIT_SECONDS,
  readIntervalMinutes,
  readSettings,
  readWaitSeconds,
} from '../hooks/settings'

test('waitSeconds: valid numbers pass through', () => {
  expect(readWaitSeconds(20)).toBe(20)
  expect(readWaitSeconds(1)).toBe(1)
  expect(readWaitSeconds(90.5)).toBe(90.5)
})

test('waitSeconds: invalid values fall back to the default', () => {
  for (const bad of [undefined, null, NaN, Infinity, -Infinity, -5, 'abc', '', '  ', true, ['10'], {}]) {
    expect(readWaitSeconds(bad)).toBe(DEFAULT_WAIT_SECONDS)
  }
})

test('waitSeconds: numeric strings are read, out-of-range values are clamped', () => {
  expect(readWaitSeconds('45')).toBe(45)
  expect(readWaitSeconds(' 12 ')).toBe(12)
  expect(readWaitSeconds(0)).toBe(1)
  expect(readWaitSeconds(0.2)).toBe(1)
  expect(readWaitSeconds(10_000_000)).toBe(3600)
})

test('intervalMinutes: 0 turns it off, valid numbers pass through', () => {
  expect(readIntervalMinutes(0)).toBe(0)
  expect(readIntervalMinutes('0')).toBe(0)
  expect(readIntervalMinutes(30)).toBe(30)
  expect(readIntervalMinutes('15')).toBe(15)
})

test('intervalMinutes: invalid values fall back to the default', () => {
  for (const bad of [undefined, NaN, Infinity, -1, 'soon', '', false]) {
    expect(readIntervalMinutes(bad)).toBe(DEFAULT_INTERVAL_MINUTES)
  }
})

test('intervalMinutes: out-of-range values are clamped', () => {
  expect(readIntervalMinutes(0.1)).toBe(1)
  expect(readIntervalMinutes(1e9)).toBe(1440)
})

test('readSettings converts to milliseconds', () => {
  expect(readSettings({ waitSeconds: 20, intervalMinutes: 30 })).toEqual({ waitMs: 20_000, intervalMs: 1_800_000 })
  expect(readSettings({})).toEqual({ waitMs: 20_000, intervalMs: 1_800_000 })
  expect(readSettings({ waitSeconds: 'x', intervalMinutes: 0 })).toEqual({ waitMs: 20_000, intervalMs: 0 })
})
