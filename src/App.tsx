import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { RequireAuth } from './components/RequireAuth'
import { InvitePage } from './pages/InvitePage'
import { LoginPage } from './pages/LoginPage'
import { CrmDealPage } from './pages/CrmDealPage'
import { CrmPage } from './pages/CrmPage'
import { InfovodDetailPage } from './pages/InfovodDetailPage'
import { MediaMonitorPage } from './pages/MediaMonitorPage'
import { ProjectDetailPage } from './pages/ProjectDetailPage'
import { ProjectFormPage } from './pages/ProjectFormPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { PromptMasterPage } from './pages/PromptMasterPage'
import { RegionBriefPage } from './pages/RegionBriefPage'
import { RegionsPage } from './pages/RegionsPage'
import { SettingsPage } from './pages/SettingsPage'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/invite/:token" element={<InvitePage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="/" element={<ProjectsPage />} />
          <Route path="/projects/new" element={<ProjectFormPage />} />
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
          <Route path="/projects/:id/edit" element={<ProjectFormPage />} />
          <Route path="/regions" element={<RegionsPage />} />
          <Route path="/regions/:id" element={<RegionBriefPage />} />
          <Route path="/media" element={<MediaMonitorPage />} />
          <Route path="/media/:id" element={<InfovodDetailPage />} />
          <Route path="/crm" element={<CrmPage />} />
          <Route path="/crm/:id" element={<CrmDealPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/prompt" element={<PromptMasterPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}
