// 需求 7：仪器设备管理（台账 / 预约使用 / 维护保养）
// 面向 40 人左右工科课题组：设备台账（资产/负责人/共享状态）、预约审批流（pending→approved/rejected→done）、
// 维护保养（例行保养/维修/校准），维修期间自动置为「维护中」。
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter } from "../middleware";
import { permProcedure, audit, createAutoTodo, completeSourceTodos } from "../auth";
import { getDb } from "../queries/connection";
import { devices, deviceBookings, deviceMaintenance, users } from "@db/schema";

const deviceInput = z.object({
  name: z.string().min(1),
  model: z.string().optional(),
  assetNo: z.string().optional(),
  vendor: z.string().optional(),
  purchaseDate: z.string().optional(),
  price: z.number().default(0),
  projectId: z.number().nullable().optional(),
  location: z.string().optional(),
  keeperId: z.number().nullable().optional(),
  status: z.enum(["in_use", "maintenance", "idle", "scrapped"]).default("in_use"),
  shared: z.boolean().default(true),
  note: z.string().optional(),
  fileIds: z.array(z.number()).default([]),
});

async function withKeeperNames<T extends { keeperId: number | null }>(rows: T[]) {
  const allUsers = await getDb().select().from(users);
  const nameOf = (id: number | null) => (id ? allUsers.find((u) => u.id === id)?.name ?? null : null);
  return rows.map((d) => ({ ...d, keeperName: d.keeperId ? nameOf(d.keeperId) : null }));
}

async function assertDeviceKeeper(deviceId: number, userId: number, profile: string) {
  const [device] = await getDb().select().from(devices).where(eq(devices.id, deviceId)).limit(1);
  if (!device) throw new TRPCError({ code: "NOT_FOUND", message: "设备不存在" });
  if (profile !== "super_admin" && device.keeperId !== userId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "仅设备负责人或超级管理员可执行该操作" });
  }
  return device;
}

export const deviceAssetsRouter = createRouter({
  list: permProcedure("device.assets", "readonly").query(async () => {
    const rows = await getDb().select().from(devices).orderBy(desc(devices.id));
    return withKeeperNames(rows);
  }),

  create: permProcedure("device.assets", "editable")
    .input(deviceInput)
    .mutation(async ({ ctx, input }) => {
      await getDb().insert(devices).values({ ...input, keeperId: input.keeperId ?? ctx.user.id });
      await audit(ctx.user, "新增设备", "device.assets", input.name);
      return { ok: true };
    }),

  update: permProcedure("device.assets", "editable")
    .input(deviceInput.partial().extend({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      await assertDeviceKeeper(id, ctx.user.id, ctx.profile);
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      await getDb().update(devices).set(patch).where(eq(devices.id, id));
      await audit(ctx.user, "编辑设备", "device.assets", `#${id}`);
      return { ok: true };
    }),

  remove: permProcedure("device.assets", "manage")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await assertDeviceKeeper(input.id, ctx.user.id, ctx.profile);
      await db.delete(deviceBookings).where(eq(deviceBookings.deviceId, input.id));
      await db.delete(deviceMaintenance).where(eq(deviceMaintenance.deviceId, input.id));
      await db.delete(devices).where(eq(devices.id, input.id));
      await audit(ctx.user, "删除设备", "device.assets", `#${input.id}`);
      return { ok: true };
    }),
});

export const deviceBookingsRouter = createRouter({
  list: permProcedure("device.bookings", "readonly").query(async ({ ctx }) => {
    const db = getDb();
    const rows = await db.select().from(deviceBookings).orderBy(desc(deviceBookings.id));
    const devs = await db.select().from(devices);
    const devName = (id: number) => devs.find((d) => d.id === id)?.name ?? `#${id}`;
    return rows
      .filter((b) => {
        const device = devs.find((d) => d.id === b.deviceId);
        return ctx.profile === "super_admin" || b.userId === ctx.user.id || device?.keeperId === ctx.user.id;
      })
      .map((b) => {
        const device = devs.find((d) => d.id === b.deviceId);
        const canReview = ctx.profile === "super_admin" || device?.keeperId === ctx.user.id;
        return { ...b, deviceName: devName(b.deviceId), canReview, canFinish: canReview || b.userId === ctx.user.id };
      });
  }),

  create: permProcedure("device.bookings", "editable")
    .input(
      z.object({
        deviceId: z.number(),
        startTime: z.string().min(10),
        endTime: z.string().min(10),
        purpose: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [dev] = await db.select().from(devices).where(eq(devices.id, input.deviceId)).limit(1);
      if (!dev) throw new TRPCError({ code: "NOT_FOUND", message: "设备不存在" });
      if (!dev.shared) throw new TRPCError({ code: "BAD_REQUEST", message: "该设备未开放共享预约" });
      if (dev.status === "maintenance" || dev.status === "scrapped")
        throw new TRPCError({ code: "BAD_REQUEST", message: "设备维护中/已报废，暂不可预约" });
      if (input.endTime <= input.startTime)
        throw new TRPCError({ code: "BAD_REQUEST", message: "结束时间必须晚于开始时间" });
      // 冲突检测：同设备已批准/待审的时间段重叠
      const existing = await db.select().from(deviceBookings).where(eq(deviceBookings.deviceId, input.deviceId));
      const clash = existing.find(
        (b) => ["pending", "approved"].includes(b.status) && b.startTime < input.endTime && input.startTime < b.endTime,
      );
      if (clash)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `该时段与 ${clash.userName ?? "他人"} 的预约（${clash.startTime} ~ ${clash.endTime}）冲突`,
        });
      const res = await db.insert(deviceBookings).values({
        ...input,
        userId: ctx.user.id,
        userName: ctx.user.name,
      });
      // 通知设备负责人审批
      if (dev.keeperId) {
        await createAutoTodo({
          title: `设备预约待审批：${dev.name}`,
          description: `${ctx.user.name} 预约 ${input.startTime} ~ ${input.endTime}（${input.purpose ?? "未填写用途"}）`,
          priority: "medium",
          creatorId: ctx.user.id,
          creatorName: ctx.user.name,
          leaderIds: [dev.keeperId],
          source: "device_booking",
          sourceRefId: Number(res[0].insertId),
          link: "/device/bookings",
        });
      }
      await audit(ctx.user, "预约设备", "device.bookings", `${dev.name} ${input.startTime}`);
      return { ok: true };
    }),

  // 审批：editable 权限（设备管理员/教师）
  review: permProcedure("device.bookings", "editable")
    .input(z.object({ id: z.number(), approve: z.boolean(), note: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [b] = await db.select().from(deviceBookings).where(eq(deviceBookings.id, input.id)).limit(1);
      if (!b) throw new TRPCError({ code: "NOT_FOUND", message: "预约不存在" });
      if (b.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "该预约已处理" });
      const dev = await assertDeviceKeeper(b.deviceId, ctx.user.id, ctx.profile);
      await db
        .update(deviceBookings)
        .set({
          status: input.approve ? "approved" : "rejected",
          reviewedBy: ctx.user.id,
          reviewedByName: ctx.user.name,
          reviewNote: input.note,
        })
        .where(eq(deviceBookings.id, input.id));
      await completeSourceTodos("device_booking", b.id, ctx.user.id);
      await createAutoTodo({
        title: `设备预约${input.approve ? "已通过" : "被驳回"}：${dev?.name ?? ""}`,
        description: `${b.startTime} ~ ${b.endTime}${input.note ? `；备注：${input.note}` : ""}`,
        priority: "medium",
        creatorId: ctx.user.id,
        creatorName: ctx.user.name,
        leaderIds: [b.userId],
        source: "device_booking",
        sourceRefId: b.id,
        link: "/device/bookings",
      });
      await audit(ctx.user, "审批设备预约", "device.bookings", `#${input.id} ${input.approve ? "通过" : "驳回"}`);
      return { ok: true };
    }),

  // 使用完成 / 取消
  finish: permProcedure("device.bookings", "editable")
    .input(z.object({ id: z.number(), action: z.enum(["done", "cancelled"]) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [b] = await db.select().from(deviceBookings).where(eq(deviceBookings.id, input.id)).limit(1);
      if (!b) throw new TRPCError({ code: "NOT_FOUND", message: "预约不存在" });
      // 仅本人或设备负责人可操作
      const [dev] = await db.select().from(devices).where(eq(devices.id, b.deviceId)).limit(1);
      const canManage = ctx.profile === "super_admin" || b.userId === ctx.user.id || dev?.keeperId === ctx.user.id;
      if (!canManage) throw new TRPCError({ code: "FORBIDDEN", message: "无权操作该预约" });
      await db.update(deviceBookings).set({ status: input.action }).where(eq(deviceBookings.id, input.id));
      await completeSourceTodos("device_booking", input.id, ctx.user.id);
      await audit(ctx.user, input.action === "done" ? "设备使用完成" : "取消设备预约", "device.bookings", `#${input.id}`);
      return { ok: true };
    }),
});

const maintenanceInput = z.object({
  deviceId: z.number(),
  type: z.enum(["routine", "repair", "calibration"]).default("routine"),
  date: z.string().min(4),
  cost: z.number().default(0),
  operator: z.string().optional(),
  note: z.string().optional(),
  fileIds: z.array(z.number()).default([]),
});

export const deviceMaintenanceRouter = createRouter({
  list: permProcedure("device.maintenance", "readonly").query(async ({ ctx }) => {
    const db = getDb();
    const rows = await db.select().from(deviceMaintenance).orderBy(desc(deviceMaintenance.date), desc(deviceMaintenance.id));
    const devs = await db.select().from(devices);
    const devName = (id: number) => devs.find((d) => d.id === id)?.name ?? `#${id}`;
    return rows
      .filter((m) => ctx.profile === "super_admin" || m.createdBy === ctx.user.id || devs.find((d) => d.id === m.deviceId)?.keeperId === ctx.user.id)
      .map((m) => ({ ...m, deviceName: devName(m.deviceId) }));
  }),

  create: permProcedure("device.maintenance", "editable")
    .input(maintenanceInput)
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await assertDeviceKeeper(input.deviceId, ctx.user.id, ctx.profile);
      await db.insert(deviceMaintenance).values({
        ...input,
        createdBy: ctx.user.id,
        createdByName: ctx.user.name,
      });
      // 维修类 → 设备状态自动置为维护中
      if (input.type === "repair") {
        await db.update(devices).set({ status: "maintenance" }).where(eq(devices.id, input.deviceId));
      }
      await audit(ctx.user, "登记设备维保", "device.maintenance", `设备 #${input.deviceId} ${input.type}`);
      return { ok: true };
    }),

  remove: permProcedure("device.maintenance", "manage")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [record] = await db.select().from(deviceMaintenance).where(eq(deviceMaintenance.id, input.id)).limit(1);
      if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "维保记录不存在" });
      if (record.createdBy !== ctx.user.id) await assertDeviceKeeper(record.deviceId, ctx.user.id, ctx.profile);
      await db.delete(deviceMaintenance).where(eq(deviceMaintenance.id, input.id));
      await audit(ctx.user, "删除维保记录", "device.maintenance", `#${input.id}`);
      return { ok: true };
    }),
});
