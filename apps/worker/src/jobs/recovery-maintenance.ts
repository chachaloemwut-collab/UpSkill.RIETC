import type { Database } from "@upskill/db";

export async function maintainRecoveryCases(db: Database) {
  const now = new Date();
  await db.transaction().execute(async trx => {
    const expired = await trx.updateTable("recovery_cases")
      .set({status:"expired",updated_at:now})
      .where("status","=","issued").where("issued_until","<=",now)
      .returning("id").execute();
    if (expired.length) await trx.insertInto("recovery_case_events").values(
      expired.map(({id})=>({case_id:id,actor_id:null,status:"expired",note:"grant_expired"})),
    ).execute();
  });
  // The college chooses the retention period. Apply it only to closed requests.
  const days = Number(process.env.RECOVERY_CONTACT_RETENTION_DAYS);
  if (Number.isInteger(days) && days >= 1 && days <= 3650) {
    await db.updateTable("recovery_cases").set({contact:"",identifier:""})
      .where("status","in",["resolved","declined","cancelled"])
      .where("contact","!=","").where("updated_at","<",new Date(now.getTime()-days*86_400_000)).execute();
  }
}
