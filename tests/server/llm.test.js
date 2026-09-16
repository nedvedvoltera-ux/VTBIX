import { describe, expect, it } from 'vitest'

import { extractFromUpload } from '../../server/llm.js'

describe('extractFromUpload', () => {
  it('неизвестный файл даёт нейтральные значения', () => {
    const data = extractFromUpload('x.pdf', '')
    expect(data.industry).toBe('Строительство')
    expect(data.country).toBe('Россия')
    expect(data.region).toBe('Москва')
    expect(data.budget).toBe(5_000_000_000)
  })

  it('узнаёт энергетику', () => {
    const data = extractFromUpload('tec.pdf', 'модернизация ТЭЦ')
    expect(data.industry).toBe('Энергетика')
  })

  it('узнаёт логистику', () => {
    expect(extractFromUpload('hub.pdf', 'логистический терминал').industry).toBe('Логистика')
  })

  it('узнаёт ЦОД', () => {
    expect(extractFromUpload('dc.pdf', 'строительство дата-центра').industry).toBe('IT и ЦОД')
  })

  it('узнаёт АПК', () => {
    expect(extractFromUpload('agro.pdf', 'элеватор и ферма').industry).toBe('АПК')
  })

  it('узнаёт фарму', () => {
    expect(extractFromUpload('pharma.pdf', 'производство по GMP').industry).toBe('Фармацевтика')
  })

  it('узнаёт добычу', () => {
    expect(extractFromUpload('gok.pdf', 'горно-обогатительный, руда').industry).toBe('Добыча')
  })

  it('узнаёт Казахстан', () => {
    const data = extractFromUpload('astana.pdf', 'проект в Астане')
    expect(data.country).toBe('Казахстан')
    expect(data.region).toBe('Астана')
  })

  it('регион перебивает шаблон', () => {
    const data = extractFromUpload('teo.pdf', 'ТЭЦ в Казани')
    expect(data.industry).toBe('Энергетика')
    expect(data.region).toBe('Республика Татарстан')
  })

  it('Минск переключает страну', () => {
    const data = extractFromUpload('teo.pdf', 'завод в Минске')
    expect(data.country).toBe('Беларусь')
    expect(data.region).toBe('Минск')
  })

  it('Приморье подставляет край', () => {
    expect(extractFromUpload('teo.pdf', 'порт во Владивостоке').region).toBe('Приморский край')
  })

  it('сумма в млрд перебивает бюджет шаблона', () => {
    expect(extractFromUpload('teo.pdf', 'инвестиции 18 млрд рублей').budget).toBe(18_000_000_000)
  })

  it('сумма в млн и с запятой', () => {
    expect(extractFromUpload('teo.pdf', 'смета 850 млн').budget).toBe(850_000_000)
    expect(extractFromUpload('teo.pdf', 'смета 1,5 млрд').budget).toBe(1_500_000_000)
  })

  it('имя файла становится названием', () => {
    expect(extractFromUpload('Мост_через_Обь.pdf', '').name).toBe('Мост через Обь')
  })

  it('слишком короткое имя файла не берётся', () => {
    expect(extractFromUpload('a.pdf', '').name).toBe('Инвестиционный проект')
  })

  it('слишком длинное имя файла не берётся', () => {
    const long = `${'и'.repeat(90)}.pdf`
    expect(extractFromUpload(long, '').name).toBe('Инвестиционный проект')
  })

  it('результат стабилен между вызовами', () => {
    expect(extractFromUpload('teo.pdf', 'ТЭЦ 12 млрд')).toEqual(extractFromUpload('teo.pdf', 'ТЭЦ 12 млрд'))
  })

  it('возвращает новый объект, шаблон не портится', () => {
    const first = extractFromUpload('teo.pdf', 'ТЭЦ')
    first.industry = 'Сломано'
    expect(extractFromUpload('teo.pdf', 'ТЭЦ').industry).toBe('Энергетика')
  })
})
