import { NavLink } from 'react-router-dom'

export function SettingsNav() {
  return (
    <div className="settings-nav" role="tablist" aria-label="Разделы настроек">
      <NavLink to="/settings" end className="settings-nav__link">
        Система
      </NavLink>
      <NavLink to="/settings/prompt" className="settings-nav__link">
        Мастер промпта
      </NavLink>
    </div>
  )
}
