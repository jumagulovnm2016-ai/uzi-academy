// Академия УЗИ — серверная функция преподавателя (Supabase Edge Function «teacher-admin»).
// Делает то, что нельзя доверить браузеру: создать курсанта «по коду», сбросить пароль, удалить аккаунт.
// Секретный ключ берётся из окружения Supabase (SUPABASE_SERVICE_ROLE_KEY) и наружу не выходит.
// Вызывать может только вошедший преподаватель (role = teacher, status = active).
import { createClient } from "npm:@supabase/supabase-js@2";

const DOMAIN = "uzi-academy.invalid";            // служебные адреса аккаунтов «по коду», писем на них нет
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // без похожих символов: 0/o, 1/l/i

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function code(len = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Только POST" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

  // кто вызывает
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: who, error: whoErr } = await admin.auth.getUser(token);
  if (whoErr || !who?.user) return reply({ error: "Нужно войти" }, 401);
  const { data: me } = await admin.from("profiles").select("role,status").eq("id", who.user.id).single();
  if (!me || me.role !== "teacher" || me.status !== "active") return reply({ error: "Только для преподавателя" }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply({ error: "Неверный запрос" }, 400); }
  const action = String(body.action || "");

  // ---- создать курсанта по коду ----
  if (action === "create_student") {
    const fullName = String(body.full_name || "").trim().slice(0, 120);
    if (fullName.split(/\s+/).length < 2) return reply({ error: "Нужны фамилия и имя" }, 400);
    const groupId = body.group_id ? String(body.group_id) : null;
    let login = String(body.login || "").trim().toLowerCase();
    if (login && !/^[a-z0-9][a-z0-9._-]{2,31}$/.test(login)) return reply({ error: "Логин: латиница, цифры, точка, дефис; 3–32 символа" }, 400);
    for (let tries = 0; tries < 5; tries++) {
      const l = login || "k" + code(5);
      const pass = code(6);
      const { data, error } = await admin.auth.admin.createUser({
        email: `${l}@${DOMAIN}`, password: pass, email_confirm: true,
        user_metadata: { full_name: fullName },
        app_metadata: { by_teacher: true, login: l, group_id: groupId },
      });
      if (!error) return reply({ user_id: data.user.id, login: l, code: pass });
      if (login) return reply({ error: /already|exists|registered/i.test(error.message) ? "Такой логин уже занят" : error.message }, 400);
    }
    return reply({ error: "Не удалось подобрать свободный логин, попробуйте ещё раз" }, 500);
  }

  // ---- сбросить пароль (новый код) ----
  if (action === "reset_password") {
    const id = String(body.user_id || "");
    const { data: target } = await admin.from("profiles").select("role").eq("id", id).single();
    if (!target) return reply({ error: "Курсант не найден" }, 404);
    if (target.role === "teacher") return reply({ error: "Пароль преподавателя здесь не сбрасывается" }, 400);
    const pass = code(6);
    const { error } = await admin.auth.admin.updateUserById(id, { password: pass });
    if (error) return reply({ error: error.message }, 400);
    return reply({ code: pass });
  }

  // ---- удалить аккаунт курсанта вместе с его результатами ----
  if (action === "delete_student") {
    const id = String(body.user_id || "");
    const { data: target } = await admin.from("profiles").select("role").eq("id", id).single();
    if (!target) return reply({ error: "Курсант не найден" }, 404);
    if (target.role === "teacher") return reply({ error: "Нельзя удалить преподавателя" }, 400);
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) return reply({ error: error.message }, 400);
    return reply({ ok: true });
  }

  return reply({ error: "Неизвестное действие" }, 400);
});
