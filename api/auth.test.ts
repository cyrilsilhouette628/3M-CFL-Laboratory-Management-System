import { describe, expect, it } from "vitest";
import { hashPassword, isOwnerOrParticipant, isStrongPassword, profileOf, verifyPassword } from "./auth";

describe("记录归属与身份权限", () => {
  it("只允许牵头人或参与人通过归属判断", () => {
    expect(isOwnerOrParticipant(7, 7, [])).toBe(true);
    expect(isOwnerOrParticipant(8, 7, [8, 9])).toBe(true);
    expect(isOwnerOrParticipant(10, 7, [8, 9])).toBe(false);
    expect(isOwnerOrParticipant(10, null, null)).toBe(false);
  });

  it("管理标志不会把普通身份提升为超级管理员", () => {
    expect(profileOf({ role: "teacher", isAdmin: true })).toBe("admin");
    expect(profileOf({ role: "teacher", isAdmin: false })).toBe("teacher");
    expect(profileOf({ role: "super_admin", isAdmin: false })).toBe("super_admin");
  });
});

describe("账户密码安全", () => {
  it("校验强密码规则", () => {
    expect(isStrongPassword("Abcdef12", "admin")).toBe(true);
    expect(isStrongPassword("abcdef12", "admin")).toBe(false);
    expect(isStrongPassword("Abcdefgh", "admin")).toBe(false);
    expect(isStrongPassword("Abc12", "admin")).toBe(false);
  });

  it("密码哈希可验证且不会明文保存", () => {
    const stored = hashPassword("Abcdef12");
    expect(stored).not.toContain("Abcdef12");
    expect(verifyPassword("Abcdef12", stored)).toBe(true);
    expect(verifyPassword("Abcdef13", stored)).toBe(false);
  });
});
