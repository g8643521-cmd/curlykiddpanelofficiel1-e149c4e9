import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const requestImageEnhancement = async (apiKey: string, imageBase64: string) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 50000);

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    signal: controller.signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3.1-flash-image-preview",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Edit only the background areas behind the subject. Keep the weapon, model, object, and all subject colors/details completely intact. Do not darken, desaturate, mute, or recolor the subject. Only replace bright or gray background areas with a subtle dark blue-gray studio background that matches a dark UI.",
            },
            {
              type: "image_url",
              image_url: { url: imageBase64 },
            },
          ],
        },
      ],
      modalities: ["image", "text"],
    }),
  });

  clearTimeout(timeout);
  return response;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("enhance-screenshot misconfigured: LOVABLE_API_KEY missing");
      return jsonResponse({
        error: "SERVICE_UNAVAILABLE",
        message: "AI enhancement is temporarily unavailable.",
        fallback: true,
        status: 503,
      });
    }

    const body = await req.json().catch(() => null);
    const imageBase64 = typeof body?.imageBase64 === "string" ? body.imageBase64 : "";

    if (!imageBase64) {
      return jsonResponse({ error: "NO_IMAGE_PROVIDED", message: "No image provided" }, 400);
    }

    const response = await requestImageEnhancement(LOVABLE_API_KEY, imageBase64);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);

      if (response.status === 429) {
        return jsonResponse({
          error: "RATE_LIMITED",
          message: "AI enhancement is temporarily busy. Keep the original screenshot for now.",
          fallback: true,
          status: 429,
        });
      }

      if (response.status === 402) {
        return jsonResponse({
          error: "CREDITS_EXHAUSTED",
          message: "AI credits exhausted.",
          fallback: true,
          status: 402,
        });
      }

      return jsonResponse({
        error: "SERVICE_UNAVAILABLE",
        message: "AI enhancement is temporarily unavailable. Keep the original screenshot for now.",
        fallback: true,
        status: response.status,
      });
    }

    const data = await response.json();
    const enhancedImageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!enhancedImageUrl) {
      console.error("AI did not return an image", JSON.stringify(data));
      return jsonResponse({
        error: "NO_IMAGE_RETURNED",
        message: "AI did not return an image.",
        fallback: true,
        status: 502,
      });
    }

    return jsonResponse({ imageUrl: enhancedImageUrl });
  } catch (e) {
    console.error("enhance-screenshot error:", e);
    return jsonResponse({
      error: "SERVICE_FAILED",
      message: e instanceof Error ? e.message : "Unknown error",
      fallback: true,
      status: 500,
    });
  }
});