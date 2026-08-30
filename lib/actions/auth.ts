"use client";
/* A full navigation after authentication clears all in-memory private page state. */
/* eslint-disable @next/next/no-location-assign-relative-destination */
import { action, type ActionResult } from "@/lib/api";
import {
  newPassword,
  passwordParameters,
  passwordProof,
} from "@/lib/auth/credentials";
import { toast } from "sonner";
async function prepare(form: FormData, creating = false) {
  const email = String(form.get("email") || "")
    .trim()
    .toLowerCase();
  const password = creating
    ? newPassword(form.get("password"))
    : String(form.get("password") || "");
  const params = await passwordParameters(email);
  if (params.version !== 1 || params.iterations !== 600000)
    throw new Error("认证协议不兼容，请刷新页面");
  return {
    email,
    salt: params.salt,
    proof: await passwordProof(password, params.salt),
  };
}
const failure = (error: unknown): ActionResult => ({
  error: error instanceof Error ? error.message : "请求失败",
});
export async function loginAction(form: FormData) {
  try {
    const result = await action("loginAction", await prepare(form));
    if (result.success) window.location.assign("/dashboard/");
    return result;
  } catch (error) {
    return failure(error);
  }
}
export async function registerAction(form: FormData) {
  try {
    return await action("registerAction", {
      ...(await prepare(form, true)),
      displayName: form.get("displayName"),
    });
  } catch (error) {
    return failure(error);
  }
}
export async function logoutAction() {
  const result = await action("logoutAction");
  if (result.success) window.location.assign("/");
  else toast.error(result.error || "退出失败，请重试");
}
export async function requestPasswordResetAction(form: FormData) {
  try {
    return await action("requestPasswordResetAction", {
      ...(await prepare(form, true)),
      recoveryCode: String(form.get("recoveryCode") || "").trim(),
    });
  } catch (error) {
    return failure(error);
  }
}
export async function updatePasswordFromRecoveryAction(form: FormData) {
  try {
    const salt = String(form.get("salt") || "");
    return await action("updatePasswordFromRecoveryAction", {
      token: form.get("token"),
      proof: await passwordProof(newPassword(form.get("password")), salt),
    });
  } catch (error) {
    return failure(error);
  }
}
