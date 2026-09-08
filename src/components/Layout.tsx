import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { IconChevron, IconClose, IconGrid, IconMenu, IconRank, IconSliders } from './Icons'
import { useApp } from '../context/AppContext'

const SIDEBAR_KEY = 'vtbih.sidebarCollapsed'

function readCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === '1'
  } catch {
    return false
  }
}

export function Layout() {
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const location = useLocation()
  const { apiOnline } = useApp()

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0')
      return next
    })
  }

  return (
    <div className={`shell ${collapsed ? 'is-collapsed' : ''}`}>
      <aside className={`sidebar ${open ? 'is-open' : ''} ${collapsed ? 'is-collapsed' : ''}`}>
        <div className="brand">
          <span className="brand__mark">VT</span>
          <div className="brand__text">
            <strong>VTBIH</strong>
            <p>Финансовый отдел</p>
          </div>
          <button className="icon-btn sidebar__close" type="button" onClick={() => setOpen(false)} aria-label="Закрыть меню">
            <IconClose />
          </button>
        </div>

        <nav className="nav" onClick={() => setOpen(false)}>
          <NavLink
            to="/"
            title="Объекты анализа"
            className={() =>
              `nav__link ${location.pathname === '/' || location.pathname.startsWith('/projects') ? 'active' : ''}`
            }
          >
            <IconGrid />
            <span className="nav__text">Объекты анализа</span>
          </NavLink>
          <NavLink
            to="/regions"
            title="Рейтинг регионов"
            className={() => `nav__link ${location.pathname.startsWith('/regions') ? 'active' : ''}`}
          >
            <IconRank />
            <span className="nav__text">Рейтинг регионов</span>
          </NavLink>
          <NavLink to="/settings/prompt" title="Мастер промпта" className="nav__link">
            <IconSliders />
            <span className="nav__text">Мастер промпта</span>
          </NavLink>
        </nav>

        <button
          className="icon-btn sidebar__collapse"
          type="button"
          onClick={toggleCollapsed}
          aria-pressed={collapsed}
          aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
          title={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
        >
          <IconChevron />
        </button>

        <div className="sidebar__foot" title="Е. Соколова · Аналитик, финансы">
          <div className="avatar">ЕС</div>
          <div className="sidebar__who">
            <strong>Е. Соколова</strong>
            <p>Аналитик · финансы</p>
          </div>
        </div>
      </aside>

      {open && <button className="backdrop" type="button" aria-label="Закрыть меню" onClick={() => setOpen(false)} />}

      <div className="main">
        <header className="topbar">
          <button className="icon-btn topbar__menu" type="button" onClick={() => setOpen(true)} aria-label="Меню">
            <IconMenu />
          </button>
          <div className="topbar__crumb">
            {location.pathname.startsWith('/settings')
              ? 'Настройки'
              : location.pathname.startsWith('/regions')
                ? 'Рейтинг регионов'
                : 'Концессии'}
          </div>
          <span className="topbar__env">{apiOnline ? 'API' : 'лок. кэш'}</span>
        </header>
        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
