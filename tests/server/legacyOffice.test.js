import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  isLegacyOffice,
  modernizeOfficeFile,
  toFileUrl,
} from '../../server/legacyOffice.js'

const leftovers = []

afterEach(async () => {
  await Promise.all(leftovers.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('isLegacyOffice', () => {
  it('ловит старые бинарные форматы Word и Excel', () => {
    expect(isLegacyOffice('договор.doc')).toBe(true)
    expect(isLegacyOffice('MODEL.XLS')).toBe(true)
    expect(isLegacyOffice('договор.docx')).toBe(false)
    expect(isLegacyOffice('model.xlsx')).toBe(false)
    expect(isLegacyOffice('scan.pdf')).toBe(false)
  })
})

describe('toFileUrl', () => {
  it('собирает file:// URL для профиля LibreOffice', () => {
    expect(toFileUrl('/tmp/lo-profile')).toMatch(/^file:\/\/\//)
  })
})

describe('modernizeOfficeFile', () => {
  it('не трогает современные форматы', async () => {
    const result = await modernizeOfficeFile('/data/a.docx', 'a.docx')
    expect(result).toEqual({ filePath: '/data/a.docx', fileName: 'a.docx', tmpDir: null })
  })

  it('объясняет, если LibreOffice нет', async () => {
    await expect(
      modernizeOfficeFile('/data/a.doc', 'договор.doc', { resolveBinary: async () => null }),
    ).rejects.toThrow(/старый формат Word\/Excel 97–2003/)
  })

  it('переводит .doc в .docx через soffice и кладёт результат во временную папку', async () => {
    const result = await modernizeOfficeFile('/data/договор.doc', 'договор.doc', {
      resolveBinary: async () => '/usr/bin/soffice',
      async execFile(_bin, args) {
        const outDir = args[args.indexOf('--outdir') + 1]
        await fs.writeFile(path.join(outDir, 'договор.docx'), 'PK')
      },
    })
    leftovers.push(result.tmpDir)
    expect(result.fileName).toBe('договор.docx')
    expect(result.filePath.endsWith(`${path.sep}договор.docx`)).toBe(true)
    expect(await fs.readFile(result.filePath, 'utf8')).toBe('PK')
    expect(result.tmpDir.startsWith(os.tmpdir())).toBe(true)
  })

  it('бросает ошибку, если LibreOffice не создал файл', async () => {
    await expect(
      modernizeOfficeFile('/data/a.doc', 'a.doc', {
        resolveBinary: async () => '/usr/bin/soffice',
        async execFile() {},
      }),
    ).rejects.toThrow(/не создал \.docx/)
  })
})
