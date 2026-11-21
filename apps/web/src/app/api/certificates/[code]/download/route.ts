import { NextResponse } from "next/server";
import { route } from "@/server/http";
import { downloadCertificatePdf } from "@/server/certificates/download.service";

export const GET = route<never, { code: string }>({ auth: "required" }, async ({ params, user, req }) => {
  // ?inline=1 opens the PDF in the browser tab (admin "ดู" button) instead of saving it
  const inline = req.nextUrl.searchParams.get("inline") === "1";
  const file = await downloadCertificatePdf(user!, params.code);
  if (!file) return NextResponse.json({ status: "rendering" }, { status: 202, headers: { "Retry-After": "5" } });
  return new Response(new Uint8Array(file.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${file.code}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
