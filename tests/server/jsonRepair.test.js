import { describe, expect, it } from 'vitest'

import { extractJsonObject, stripThink } from '../../server/jsonRepair.js'

describe('stripThink', () => {
  it('пустая строка для пустого ввода', () => {
    expect(stripThink('')).toBe('')
    expect(stripThink(null)).toBe('')
    expect(stripThink(undefined)).toBe('')
  })

  it('вырезает блок think целиком', () => {
    expect(stripThink('до<think>рассуждения</think>после')).toBe('допосле')
  })

  it('вырезает многострочный и многократный think', () => {
        const raw = '<think>\nплан\nещё\n</think>{"a":1}<THINK>x</THINK>'
    expect(stripThink(raw)).toBe('{"a":1}')
  })

  it('убирает непарные теги', () => {
    expect(stripThink('текст</think>{"a":1}')).toBe('текст{"a":1}')
    expect(stripThink('<think>обрыв без закрытия')).toBe('обрыв без закрытия')
  })
})

describe('extractJsonObject', () => {
  it('null на пустом вводе', () => {
    expect(extractJsonObject('')).toBeNull()
    expect(extractJsonObject(null)).toBeNull()
  })

  it('null когда нет открывающей скобки', () => {
    expect(extractJsonObject('просто текст без json')).toBeNull()
  })

  it('парсит чистый JSON', () => {
    expect(extractJsonObject('{"name":"Мост","budget":1000}')).toEqual({ name: 'Мост', budget: 1000 })
  })

  it('отрезает болтовню до и ограждение после', () => {
    const raw = 'Вот результат:\n```json\n{"a":1}\n```'
    expect(extractJsonObject(raw)).toEqual({ a: 1 })
  })

  it('снимает think перед JSON', () => {
    expect(extractJsonObject('<think>надо вернуть json</think>{"score":80}')).toEqual({ score: 80 })
  })

  it('починит обрыв на незакрытой строке', () => {
    expect(extractJsonObject('{"name":"Мост через Об')).toEqual({ name: 'Мост через Об' })
  })

  it('починит обрыв на незакрытом объекте', () => {
    expect(extractJsonObject('{"a":1,"b":{"c":2')).toEqual({ a: 1, b: { c: 2 } })
  })

  it('починит обрыв на незакрытом массиве', () => {
    expect(extractJsonObject('{"rows":[{"x":1},{"x":2}')).toEqual({ rows: [{ x: 1 }, { x: 2 }] })
  })

  it('уберёт висящую запятую', () => {
    expect(extractJsonObject('{"a":1,')).toEqual({ a: 1 })
  })

  it('уберёт обрубленный ключ без значения', () => {
    expect(extractJsonObject('{"a":1,"budg')).toEqual({ a: 1 })
  })

  it('уберёт обрубленный ключ с двоеточием', () => {
    expect(extractJsonObject('{"a":1,"budget":')).toEqual({ a: 1 })
  })

  it('уберёт обрубленное число', () => {
    expect(extractJsonObject('{"a":1,"budget":-12.')).toEqual({ a: 1 })
  })

  it('не ломается на экранированных кавычках', () => {
    expect(extractJsonObject('{"text":"он сказал \\"да\\""}')).toEqual({ text: 'он сказал "да"' })
  })

  it('не путает скобки внутри строк', () => {
    expect(extractJsonObject('{"text":"{[не скобки]}","n":1}')).toEqual({ text: '{[не скобки]}', n: 1 })
  })

  it('null если починить нельзя', () => {
    expect(extractJsonObject('{"a": %%% }')).toBeNull()
  })
})
