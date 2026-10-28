import { Routes, Route, Navigate } from "react-router";
import "./App.css";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Todos from "@/pages/Todos";
import Projects from "@/pages/research/Projects";
import Collaborations from "@/pages/research/Collaborations";
import Papers from "@/pages/research/Papers";
import IpApplications from "@/pages/research/IpApplications";
import Reviews from "@/pages/research/Reviews";
import References from "@/pages/research/References";
import Citations from "@/pages/research/Citations";
import Activities from "@/pages/research/Activities";
import Visits from "@/pages/research/Visits";
import Students from "@/pages/research/Students";
import GradsTraining from "@/pages/training/GradsTraining";
import Mentoring from "@/pages/training/Mentoring";
import Achievements from "@/pages/Achievements";
import AchievementCategory from "@/pages/achievements/AchievementCategory";
import Social from "@/pages/Social";
import DeviceAssets from "@/pages/device/Assets";
import DeviceBookings from "@/pages/device/Bookings";
import DeviceMaintenance from "@/pages/device/Maintenance";
import UsersAdmin from "@/pages/admin/Users";
import ContentReview from "@/pages/config/ContentReview";
import Feedback from "@/pages/config/Feedback";
import AiTasks from "@/pages/config/AiTasks";
import Backup from "@/pages/config/Backup";
import Integrations from "@/pages/config/Integrations";
import Audit from "@/pages/admin/Audit";
import Profile from "@/pages/Profile";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/todos" element={<Todos />} />
        <Route path="/research/projects" element={<Projects />} />
        <Route path="/research/collaborations" element={<Collaborations />} />
        <Route path="/research/papers" element={<Papers />} />
        <Route path="/research/ip" element={<IpApplications />} />
        <Route path="/research/reviews" element={<Reviews />} />
        <Route path="/research/references" element={<References />} />
        <Route path="/research/citations" element={<Citations />} />
        <Route path="/research/activities" element={<Activities />} />
        <Route path="/research/visits" element={<Visits />} />
        <Route path="/training/grads" element={<GradsTraining />} />
        <Route path="/training/mentoring" element={<Mentoring />} />
        <Route path="/training/undergrads" element={<Students kind="undergrad" />} />
        <Route path="/training/postdocs" element={<Students kind="postdoc" />} />
        {/* 仪器设备（需求 7：位于人才培养之后、成果管理之前） */}
        <Route path="/device/assets" element={<DeviceAssets />} />
        <Route path="/device/bookings" element={<DeviceBookings />} />
        <Route path="/device/maintenance" element={<DeviceMaintenance />} />
        {/* 成果管理：统计盘点 + 6 个类别子模块（需求 11/12/13） */}
        <Route path="/achievements" element={<Achievements />} />
        <Route path="/achievements/:category" element={<AchievementCategory />} />
        <Route path="/social" element={<Social />} />
        <Route path="/config/users" element={<UsersAdmin />} />
        <Route path="/config/review" element={<ContentReview />} />
        <Route path="/config/feedback" element={<Feedback />} />
        <Route path="/config/ai" element={<AiTasks />} />
        <Route path="/config/backup" element={<Backup />} />
        <Route path="/config/integrations" element={<Integrations />} />
        <Route path="/config/audit" element={<Audit />} />
        <Route path="/profile" element={<Profile />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
