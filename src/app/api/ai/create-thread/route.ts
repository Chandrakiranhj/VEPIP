import { NextResponse } from "next/server";
import { deerflowFetch } from "@/lib/deerflow";

export async function POST() {
  try {
    const res = await deerflowFetch("/api/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[create-thread] DeerFlow error:", res.status, text);
      return NextResponse.json({ error: text }, { status: res.status });
    }

    const thread = (await res.json()) as { thread_id: string };
    return NextResponse.json({ threadId: thread.thread_id });
  } catch (err) {
    console.error("[create-thread] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
