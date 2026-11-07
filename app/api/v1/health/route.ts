import { ok } from "@/lib/api";
export async function GET(){return ok({status:"ok",service:"prism-pass",phase:"1-foundation",time:new Date().toISOString()});}
