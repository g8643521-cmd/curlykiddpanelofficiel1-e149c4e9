import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

async function getIconVersion(serverCode: string): Promise<number | null> {
  try {
    const resp = await fetch(
      `https://servers-frontend.fivem.net/api/servers/single/${serverCode}`,
      { headers: { "User-Agent": UA } }
    );
    if (!resp.ok) { await resp.body?.cancel(); return null; }
    const json = await resp.json();
    return json?.Data?.iconVersion ?? null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { serverCode, v } = await req.json();
    if (!serverCode) {
      return new Response(JSON.stringify({ error: "Missing serverCode" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve icon version: use provided v, or fetch from API
    let iconVersion = v;
    if (iconVersion === undefined || iconVersion === null) {
      iconVersion = await getIconVersion(serverCode);
    }

    // Try fetching the icon with the resolved version
    const urls = iconVersion !== null && iconVersion !== undefined
      ? [
          `https://servers-frontend.fivem.net/api/servers/icon/${serverCode}/${iconVersion}.png`,
          `https://servers-live.fivem.net/api/servers/icon/${serverCode}/${iconVersion}.png`,
        ]
      : [
          `https://servers-frontend.fivem.net/api/servers/icon/${serverCode}/0.png`,
          `https://servers-frontend.fivem.net/api/servers/icon/${serverCode}.png`,
        ];

    let imageResp: Response | null = null;
    for (const url of urls) {
      try {
        const resp = await fetch(url, {
          headers: { "User-Agent": UA },
          redirect: "follow",
        });
        if (resp.ok && resp.headers.get("content-type")?.includes("image")) {
          imageResp = resp;
          break;
        }
        await resp.body?.cancel();
      } catch {
        continue;
      }
    }

    if (!imageResp) {
      return new Response(JSON.stringify({ error: "Icon not found" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const imageBytes = await imageResp.arrayBuffer();

    return new Response(imageBytes, {
      headers: {
        ...corsHeaders,
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
