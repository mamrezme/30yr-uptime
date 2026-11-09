import { expect, test } from 'claude-code/testing'

import {
  DEFAULT_INTERVAL_MINUTES,
  DEFAULT_WAIT_SECONDS,
  readIntervalMinutes,
  MOVES,
  readEnabled,
  readSettings,
  readWaitSeconds,
  findKey,
  parseSetting,
  toRaw,
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

const timing = (o: Parameters<typeof readSettings>[0]) => {
  const { waitMs, intervalMs } = readSettings(o)
  return { waitMs, intervalMs }
}

test('the defaults: 15 seconds, 30 minutes', () => {
  expect(DEFAULT_WAIT_SECONDS).toBe(15)
  expect(DEFAULT_INTERVAL_MINUTES).toBe(30)
})

test('readSettings converts to milliseconds', () => {
  expect(timing({ waitSeconds: 20, intervalMinutes: 45 })).toEqual({ waitMs: 20_000, intervalMs: 2_700_000 })
  expect(timing({})).toEqual({ waitMs: 15_000, intervalMs: 1_800_000 })
  expect(timing({ waitSeconds: 'x', intervalMinutes: 0 })).toEqual({ waitMs: 15_000, intervalMs: 0 })
})

test('every move is on unless its option is turned off', () => {
  expect([...readSettings({}).enabled]).toEqual([...MOVES])
  const enabled = readSettings({ squat: false, lunge: 'off', walk: 'FALSE', eyes: true, water: 'yes' }).enabled
  expect([...enabled]).toEqual(MOVES.filter(m => !['squat', 'lunge', 'walk'].includes(m)))
  expect(enabled.has('water')).toBe(true)
  expect(enabled.has('eyes')).toBe(true)
})

test('readEnabled: only an explicit off turns a move off', () => {
  for (const off of [false, 0, 'false', 'off', 'no', '0', ' Off ']) expect(readEnabled(off)).toBe(false)
  for (const on of [true, undefined, null, 1, 'true', 'on', '', 'banana', ['x']]) expect(readEnabled(on)).toBe(true)
})

test('parseSetting: numbers in range are stored, clamped like the readers', () => {
  expect(parseSetting('waitSeconds', '30')).toEqual({ value: 30 })
  expect(parseSetting('waitSeconds', '0')).toEqual({ value: 1 })
  expect(parseSetting('waitSeconds', '1e9')).toEqual({ value: 3600 })
  expect(parseSetting('intervalMinutes', '0')).toEqual({ value: 0 })
  expect(parseSetting('intervalMinutes', '99999')).toEqual({ value: 1440 })
})

test('parseSetting: what the readers would turn into the default is refused', () => {
  for (const bad of ['', 'x', '-1', 'NaN', 'Infinity']) {
    expect('error' in parseSetting('waitSeconds', bad)).toBe(true)
    expect('error' in parseSetting('intervalMinutes', bad)).toBe(true)
  }
})

test('parseSetting: a move takes on or off, in the words readEnabled knows', () => {
  for (const on of ['on', 'TRUE', 'yes', '1']) expect(parseSetting('squat', on)).toEqual({ value: true })
  for (const off of ['off', 'False', 'no', '0']) expect(parseSetting('squat', off)).toEqual({ value: false })
  expect('error' in parseSetting('squat', 'banana')).toBe(true)
})

test('findKey: case-insensitive, unknown keys are undefined', () => {
  expect(findKey('WAITSECONDS')).toBe('waitSeconds')
  expect(findKey('hipFlexor')).toBe('hipflexor')
  expect(findKey('pushups')).toBe(undefined)
})

test('toRaw: only a plain object is read as settings', () => {
  for (const bad of [undefined, null, 'x', 3, ['a']]) expect(toRaw(bad)).toEqual({})
  expect(toRaw({ squat: false })).toEqual({ squat: false })
})
