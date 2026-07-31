import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptCredential } from "./crypto";
export async function loadCredential(ownerId:string,connectionId:string,providerKey:string){const{data}=await createAdminClient().from("ioc_provider_credentials").select("ciphertext_b64,iv_b64,auth_tag_b64,key_version").eq("owner_id",ownerId).eq("provider_connection_id",connectionId).eq("provider_key",providerKey).maybeSingle();if(!data)return null;return decryptCredential(data,{ownerId,connectionId,providerKey,keyVersion:data.key_version});}
