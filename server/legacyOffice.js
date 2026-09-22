import { execFile as execFileCb } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFileCb)

export const LEGACY_TARGET = {
  '.doc': 'docx',
  '.xls': 'xlsx',
}

export function isLegacyOffice(fileName) {
  return Boolean(LEGACY_TARGET[path.extname(String(fileName || '')).toLowerCase()])
}

export function toFileUrl(filePath) {
  const pathname = path.resolve(filePath).replace(/\\/g, '/')
  if (/^[A-Za-z]:/.test(pathname)) return `file:///${pathname}`
  return `file://${pathname.startsWith('/') ? pathname : `/${pathname}`}`
}

async function pathExists(candidate) {
  try {
    await fs.access(candidate)
    return true
  } catch {
    return false
  }
}

export async function resolveSoffice(execFile = execFileAsync) {
  const fromEnv = process.env.LIBREOFFICE_PATH?.trim()
  if (fromEnv) {
    if (await pathExists(fromEnv)) return fromEnv
    throw new Error(`LIBREOFFICE_PATH указывает на несуществующий файл: ${fromEnv}`)
  }

  const win = process.platform === 'win32'
  const candidates = win
    ? [
        'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
        'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
      ]
    : ['/usr/bin/soffice', '/usr/bin/libreoffice', '/usr/lib/libreoffice/program/soffice']

  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate
  }

  try {
    const { stdout } = await execFile(win ? 'where' : 'which', [win ? 'soffice.exe' : 'soffice'], {
      timeout: 5_000,
      windowsHide: true,
    })
    const first = String(stdout)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean)
    if (first && (await pathExists(first))) return first
  } catch {
    // нет в PATH
  }
  return null
}

function missingMessage(fileName, target) {
  return (
    `Файл ${fileName} — старый формат Word/Excel 97–2003. ` +
    `Docling читает его только после перевода в .${target}. ` +
    `Установите LibreOffice на сервер или сохраните файл как .${target} и загрузите снова.`
  )
}

export async function modernizeOfficeFile(filePath, fileName, deps = {}) {
  const target = LEGACY_TARGET[path.extname(String(fileName || '')).toLowerCase()]
  if (!target) return { filePath, fileName, tmpDir: null }

  const execFile = deps.execFile || execFileAsync
  const bin = await (deps.resolveBinary || resolveSoffice)(execFile)
  if (!bin) throw new Error(missingMessage(fileName, target))

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vtbih-lo-'))
  const outDir = path.join(tmpDir, 'out')
  const profileDir = path.join(tmpDir, 'profile')
  await fs.mkdir(outDir)
  await fs.mkdir(profileDir)

  const args = [
    `-env:UserInstallation=${toFileUrl(profileDir)}`,
    '--headless',
    '--norestore',
    '--nolockcheck',
    '--nologo',
    '--nofirststartwizard',
    '--convert-to',
    target,
    '--outdir',
    outDir,
    filePath,
  ]

  try {
    await execFile(bin, args, {
      timeout: 180_000,
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
      env: {
        ...process.env,
        HOME: tmpDir,
        ...(process.platform === 'win32' ? {} : { SAL_USE_VCLPLUGIN: 'svp' }),
      },
    })
  } catch (error) {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    const detail = String(error?.stderr || error?.message || error).slice(0, 400)
    throw new Error(`LibreOffice не смог перевести ${fileName} в .${target}: ${detail}`)
  }

  const expectedName = `${path.basename(fileName, path.extname(fileName))}.${target}`
  let converted = path.join(outDir, expectedName)
  try {
    await fs.access(converted)
  } catch {
    const names = await fs.readdir(outDir)
    const found = names.find((name) => name.toLowerCase().endsWith(`.${target}`))
    if (!found) {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
      throw new Error(`LibreOffice не создал .${target} из ${fileName}`)
    }
    converted = path.join(outDir, found)
  }

  return {
    filePath: converted,
    fileName: path.basename(converted),
    tmpDir,
  }
}
