import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
export async function requireUser() { const supabase = await createClient(); const { data: { user }, error } = await supabase.auth.getUser(); if (error || !user) redirect("/auth/sign-in"); return { supabase, user }; }
export async function getUser() { try { const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); return user; } catch { return null; } }
