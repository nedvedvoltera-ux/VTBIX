import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ProjectsPage } from './pages/ProjectsPage'
import { ProjectFormPage } from './pages/ProjectFormPage'
import { ProjectDetailPage } from './pages/ProjectDetailPage'
import { PromptMasterPage } from './pages/PromptMasterPage'
import { RegionsPage } from './pages/RegionsPage'
import { RegionBriefPage } from './pages/RegionBriefPage'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<ProjectsPage />} />
        <Route path="/projects/new" element={<ProjectFormPage />} />
        <Route path="/projects/:id" element={<ProjectDetailPage />} />
        <Route path="/projects/:id/edit" element={<ProjectFormPage />} />
        <Route path="/regions" element={<RegionsPage />} />
        <Route path="/regions/:id" element={<RegionBriefPage />} />
        <Route path="/settings/prompt" element={<PromptMasterPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
