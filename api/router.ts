import { createRouter, publicQuery } from "./middleware";
import { authRouter } from "./routers/authRouter";
import { usersRouter } from "./routers/usersRouter";
import { todosRouter } from "./routers/todosRouter";
import { dashboardRouter } from "./routers/dashboardRouter";
import { projectsRouter } from "./routers/projectsRouter";
import { collabRouter } from "./routers/progressRouter"; // progressRouter 已随【学生科研进度】子模块下线（需求 14）
import { papersRouter, reviewsRouter, paperRoundsRouter } from "./routers/papersRouter";
import { referencesRouter, citationsRouter, refDirectionsRouter } from "./routers/referencesRouter";
import { activitiesRouter, visitsRouter } from "./routers/activitiesRouter";
import { fundsRouter, studentsRouter } from "./routers/fundsRouter";
import { achievementsRouter, socialRouter } from "./routers/achievementsRouter";
import { filesRouter, aiRouter } from "./routers/filesRouter";
import { tasksRouter, pointsRouter, docSharesRouter, mentorsRouter, weeklyRouter, trainingNodesRouter, trainingDashRouter } from "./routers/trainingRouter";
import { websiteRouter, configRouter } from "./routers/websiteRouter";
import { deviceAssetsRouter, deviceBookingsRouter, deviceMaintenanceRouter } from "./routers/devicesRouter";
import { reviewRouter } from "./routers/reviewRouter";
import { quickLinksRouter } from "./routers/quickLinksRouter";
import { backupRouter } from "./routers/backupRouter";
import { ipRouter, feedbackRouter, mentoringRouter } from "./routers/recoveryRouter";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  users: usersRouter,
  todos: todosRouter,
  quickLinks: quickLinksRouter,
  backup: backupRouter,
  dashboard: dashboardRouter,
  projects: projectsRouter,
  collabs: collabRouter,
  papers: papersRouter,
  ip: ipRouter,
  feedback: feedbackRouter,
  mentoring: mentoringRouter,
  reviews: reviewsRouter,
  references: referencesRouter,
  citations: citationsRouter,
  activities: activitiesRouter,
  visits: visitsRouter,
  funds: fundsRouter,
  students: studentsRouter,
  achievements: achievementsRouter,
  social: socialRouter,
  files: filesRouter,
  ai: aiRouter,
  tasks: tasksRouter,
  points: pointsRouter,
  docShares: docSharesRouter,
  mentors: mentorsRouter,
  website: websiteRouter,
  config: configRouter,
  paperRounds: paperRoundsRouter,
  refDirections: refDirectionsRouter,
  weekly: weeklyRouter,
  trainingNodes: trainingNodesRouter,
  trainingDash: trainingDashRouter,
  deviceAssets: deviceAssetsRouter,
  deviceBookings: deviceBookingsRouter,
  deviceMaintenance: deviceMaintenanceRouter,
  review: reviewRouter,
});

export type AppRouter = typeof appRouter;
