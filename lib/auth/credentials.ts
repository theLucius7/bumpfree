"use client";
import { api } from "@/lib/api";
export async function passwordParameters(email: string) {
  return api<{ salt: string; iterations: number; version: number }>(
    "auth/parameters",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    },
  );
}
export async function passwordProof(password: string, salt: string) {
  if (!crypto?.subtle) throw new Error("需要 HTTPS 安全连接才能登录");
  if (!/^[a-f0-9]{32}$/.test(salt)) throw new Error("认证参数不正确");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password.normalize("NFC")),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const data = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: 600000,
      salt: new Uint8Array(salt.match(/../g)!.map((b) => parseInt(b, 16))),
    },
    key,
    256,
  );
  return Array.from(new Uint8Array(data), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export function newPassword(value: FormDataEntryValue | null) {
  if (
    typeof value !== "string" ||
    [...value.normalize("NFC")].length < 15 ||
    value.length > 128
  )
    throw new Error("新密码需要 15–128 个字符，可使用多个词组成的密码");
  return value;
}
