import { Navigate, Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './lib/AuthContext';
import AppShell from './layouts/AppShell';
import Login from './pages/Login';
import Register from './pages/Register';
import VerifyEmail from './pages/VerifyEmail';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import AdminUsers from './pages/AdminUsers';
import AdminAcademic from './pages/AdminAcademic';
import Questions from './pages/Questions';
import Exams from './pages/Exams';
import ExamPaperEditor from './pages/ExamPaperEditor';
import ExamSubmissions from './pages/ExamSubmissions';
import JoinExam from './pages/JoinExam';
import StudentExams from './pages/StudentExams';
import TakeExam from './pages/TakeExam';
import StudentResults from './pages/StudentResults';

// UX-only guards. The API enforces every permission again on the server.
function Protected({ roles, children }) {
  const { user, ready } = useAuth();
  const { t } = useTranslation();
  if (!ready) return <div className="p-8 text-ink-soft">{t('common.loading')}</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/app" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/app" element={<Protected><AppShell /></Protected>}>
        <Route index element={<Dashboard />} />
        {/* Admin Routes */}
        <Route path="admin/users" element={<Protected roles={['ADMIN']}><AdminUsers /></Protected>} />
        <Route path="admin/academic" element={<Protected roles={['ADMIN']}><AdminAcademic /></Protected>} />
        {/* Professor Routes */}
        <Route path="questions" element={<Protected roles={['PROFESSOR', 'ADMIN']}><Questions /></Protected>} />
        <Route path="exams" element={<Protected roles={['PROFESSOR', 'ADMIN']}><Exams /></Protected>} />
        <Route path="exams/new" element={<Protected roles={['PROFESSOR', 'ADMIN']}><ExamPaperEditor /></Protected>} />
        <Route path="exams/:id/edit" element={<Protected roles={['PROFESSOR', 'ADMIN']}><ExamPaperEditor /></Protected>} />
        <Route path="exams/:id/submissions" element={<Protected roles={['PROFESSOR', 'ADMIN']}><ExamSubmissions /></Protected>} />
        {/* Student Routes */}
        <Route path="exams/join" element={<Protected roles={['STUDENT']}><JoinExam /></Protected>} />
        <Route path="exams/take" element={<Protected roles={['STUDENT']}><StudentExams /></Protected>} />
        <Route path="exam-session/:sessionId" element={<Protected roles={['STUDENT']}><TakeExam /></Protected>} />
        <Route path="results" element={<Protected roles={['STUDENT']}><StudentResults /></Protected>} />
      </Route>
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
