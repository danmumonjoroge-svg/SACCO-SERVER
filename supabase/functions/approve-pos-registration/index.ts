// supabase/functions/approve-pos-registration/index.ts
//
// Called by POSRegistrationRequests.js (admin approval UI). This is the
// ONLY place a pending pos_registration_requests row turns into an
// actual login-capable account — the registration form itself
// (RegisterPOSUser.js) only ever inserts a pending row.
//
// action: "approve" | "reject"

import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!token) return new Response("Missing auth token", { status: 401 });

  const { requestId, action, reviewNotes } = await req.json();
  if (!requestId || !["approve", "reject"].includes(action)) {
    return new Response("Invalid request", { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !user) return new Response("Invalid session", { status: 401 });

  const { data: caller } = await supabase
    .from("users").select("role").eq("auth_user_id", user.id).maybeSingle();
  if (!caller || !["admin", "superadmin", "manager"].includes(caller.role)) {
    return new Response("You are not authorized to review registrations.", { status: 403 });
  }

  const { data: reqRow, error: reqErr } = await supabase
    .from("pos_registration_requests").select("*").eq("id", requestId).maybeSingle();
  if (reqErr || !reqRow) return new Response("Request not found", { status: 404 });
  if (reqRow.status !== "pending") return new Response("Request already reviewed", { status: 409 });

  if (action === "reject") {
    await supabase.from("pos_registration_requests").update({
      status: "rejected",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      review_notes: reviewNotes ?? null,
    }).eq("id", requestId);

    return new Response(JSON.stringify({ ok: true, status: "rejected" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // ---- approve ----

  // 1. Create the Supabase Auth user (email pre-confirmed — they proved
  //    ownership by receiving the set-password email below).
  const { data: newAuthUser, error: createErr } = await supabase.auth.admin.createUser({
    email: reqRow.email,
    email_confirm: true,
  });
  if (createErr || !newAuthUser?.user) {
    return new Response(`Could not create account: ${createErr?.message}`, { status: 500 });
  }

  // 2. Send them a "set your password" email — reuses the recovery flow.
  const { error: linkErr } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email: reqRow.email,
  });
  if (linkErr) console.error("[approve-pos-registration] set-password link error:", linkErr.message);

  // 3. Generate the next UI-XXXX member_no for the `users` table.
  const { data: lastUser } = await supabase
    .from("users").select("member_no").order("member_no", { ascending: false }).limit(1).maybeSingle();
  const nextNum = lastUser?.member_no
    ? parseInt(String(lastUser.member_no).replace(/\D/g, ""), 10) + 1
    : 1;
  const memberNo = `UI-${String(nextNum).padStart(4, "0")}`;

  // 4. Create the staff row itself.
  const { error: insertErr } = await supabase.from("users").insert({
    member_no: memberNo,
    name: reqRow.full_name,
    email: reqRow.email,
    role: reqRow.requested_role,
    status: "active",
    auth_user_id: newAuthUser.user.id,
  });
  if (insertErr) {
    return new Response(`Account created but staff record failed: ${insertErr.message}`, { status: 500 });
  }

  // 5. Close out the request.
  await supabase.from("pos_registration_requests").update({
    status: "approved",
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
    review_notes: reviewNotes ?? null,
    created_user_id: newAuthUser.user.id,
  }).eq("id", requestId);

  return new Response(JSON.stringify({ ok: true, status: "approved", memberNo }), {
    headers: { "Content-Type": "application/json" },
  });
});
