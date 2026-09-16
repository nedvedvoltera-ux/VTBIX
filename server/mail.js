import nodemailer from 'nodemailer'
import { getAppSettings, saveAppSettings } from './db.js'

function clip(value, max = 240) {
  return String(value || '').trim().slice(0, max)
}

function maskKey(key) {
  const value = String(key || '')
  if (!value) return ''
  if (value.length <= 8) return '••••'
  return `${value.slice(0, 4)}…${value.slice(-4)}`
}

export function getMailSettings() {
  const mail = getAppSettings().mail || {}
  return {
    host: clip(mail.host, 180),
    port: Number(mail.port) > 0 ? Number(mail.port) : 587,
    secure: Boolean(mail.secure),
    user: clip(mail.user, 180),
    password: typeof mail.password === 'string' ? mail.password : '',
    from: clip(mail.from || mail.user, 180),
    fromName: clip(mail.fromName || 'VTBIH CRM', 80) || 'VTBIH CRM',
  }
}

export function publicMailSettings() {
  const mail = getMailSettings()
  return {
    host: mail.host,
    port: mail.port,
    secure: mail.secure,
    user: mail.user,
    from: mail.from,
    fromName: mail.fromName,
    hasPassword: Boolean(mail.password),
    passwordMasked: maskKey(mail.password),
    connected: Boolean(mail.host && mail.user && mail.password),
  }
}

export async function saveMailSettings(body = {}) {
  const current = getMailSettings()
  const next = {
    host: body.host !== undefined ? clip(body.host, 180) : current.host,
    port: body.port !== undefined ? Number(body.port) || 587 : current.port,
    secure: body.secure !== undefined ? Boolean(body.secure) : current.secure,
    user: body.user !== undefined ? clip(body.user, 180) : current.user,
    password: current.password,
    from: body.from !== undefined ? clip(body.from, 180) : current.from,
    fromName: body.fromName !== undefined ? clip(body.fromName, 80) : current.fromName,
  }
  if (typeof body.password === 'string' && body.password.trim()) next.password = body.password
  if (body.clearPassword) next.password = ''
  if (!next.from) next.from = next.user
  const settings = getAppSettings()
  await saveAppSettings({ ...settings, mail: next })
  return publicMailSettings()
}

function transporter(mail = getMailSettings()) {
  if (!mail.host || !mail.user || !mail.password) {
    const error = new Error('Подключите почту: сервер, логин и пароль SMTP')
    error.status = 400
    error.code = 'mail_off'
    throw error
  }
  return nodemailer.createTransport({
    host: mail.host,
    port: mail.port,
    secure: mail.secure,
    auth: { user: mail.user, pass: mail.password },
    connectionTimeout: 12_000,
    greetingTimeout: 12_000,
    socketTimeout: 20_000,
  })
}

export async function testMailConnection() {
  const mail = getMailSettings()
  const transport = transporter(mail)
  try {
    await transport.verify()
    return { ok: true, connected: true, host: mail.host, user: mail.user }
  } catch (err) {
    const error = new Error(err instanceof Error ? err.message : String(err))
    error.status = 400
    error.code = 'mail_fail'
    throw error
  } finally {
    transport.close()
  }
}

function validAddress(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim())
}

export async function sendDealEmail({ to, cc, subject, body }) {
  const recipients = String(to || '')
    .split(/[,;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
  if (!recipients.length || recipients.some((item) => !validAddress(item))) {
    const error = new Error('Укажите корректный адрес получателя')
    error.status = 400
    throw error
  }
  const copies = String(cc || '')
    .split(/[,;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
  if (copies.some((item) => !validAddress(item))) {
    const error = new Error('Некорректный адрес в копии')
    error.status = 400
    throw error
  }
  const title = clip(subject, 180) || 'VTBIH'
  const text = String(body || '').trim()
  if (!text) {
    const error = new Error('Напишите текст письма')
    error.status = 400
    throw error
  }
  const mail = getMailSettings()
  const transport = transporter(mail)
  try {
    const info = await transport.sendMail({
      from: mail.fromName ? `"${mail.fromName.replace(/"/g, '')}" <${mail.from}>` : mail.from,
      to: recipients.join(', '),
      cc: copies.length ? copies.join(', ') : undefined,
      subject: title,
      text,
    })
    return {
      ok: true,
      messageId: info.messageId || '',
      to: recipients,
      cc: copies,
      subject: title,
    }
  } catch (err) {
    const error = new Error(err instanceof Error ? err.message : String(err))
    error.status = 400
    error.code = 'mail_send'
    throw error
  } finally {
    transport.close()
  }
}
