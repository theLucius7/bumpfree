"use client";
import { action, api, type Me } from "@/lib/api";
import {
  newPassword,
  passwordParameters,
  passwordProof,
} from "@/lib/auth/credentials";
export const updateProfileAction = (form: FormData) =>
  action("updateProfileAction", form);
export async function updateAuthAction(form: FormData) {
  try {
    const me = await api<Me>("me");
    if (!me.user) return { error: "请先登录" };
    const params = await passwordParameters(me.user.email);
    const currentProof = await passwordProof(
      String(form.get("currentPassword") || ""),
      params.salt,
    );
    const password = form.get("password");
    return action("updateAuthAction", {
      email: form.get("email"),
      currentProof,
      proof: password
        ? await passwordProof(newPassword(password), params.salt)
        : undefined,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "更新失败" };
  }
}
