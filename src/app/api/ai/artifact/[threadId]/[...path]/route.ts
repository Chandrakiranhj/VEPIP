export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return new Response("Assistant artifact links have been retired. Regenerate the report in Report Studio.", {
    status: 410,
  });
}
