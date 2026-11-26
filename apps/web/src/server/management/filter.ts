import "server-only";
import {cookies} from "next/headers";
import {decryptSettingSecret,encryptSettingSecret} from "@upskill/infra/secret-box";
import {ctx} from "../context";
import type {CurrentUser} from "../auth/session";
import type {Resource} from "./catalog";

export async function filterFor(user:CurrentUser,key:Resource) {
  const value=(await cookies()).get("management_filter")?.value;
  if (!value) return "";
  try {
    const [session,resource,query]=JSON.parse(decryptSettingSecret(value,ctx().env.SETTINGS_ENCRYPTION_KEY));
    return session===user.sessionId && resource===key && typeof query==="string" ? query.slice(0,100) : "";
  } catch {return "";}
}
export async function setFilter(user:CurrentUser,key:Resource,q:string) {
  const {env}=ctx();
  const value=encryptSettingSecret(JSON.stringify([user.sessionId,key,q.slice(0,100)]),env.SETTINGS_ENCRYPTION_KEY);
  (await cookies()).set("management_filter",value,{httpOnly:true,sameSite:"strict",secure:env.APP_ORIGIN.startsWith("https:"),maxAge:900,path:"/"});
}
