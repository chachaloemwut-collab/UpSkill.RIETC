import { NextResponse } from "next/server";
import { route } from "@/server/http";
import { exportUserData } from "@/server/account/account.service";

export const GET = route({ auth: "required" }, async ({ user }) => {
  const data = await exportUserData(user!);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="my-data-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
});