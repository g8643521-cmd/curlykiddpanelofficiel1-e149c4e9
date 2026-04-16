import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let body: any = null;
  try {
    body = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { mode } = body;

    // === BATCH MODE: analyze multiple files in a single AI call ===
    if (mode === "batch") {
      const { files, categories } = body;
      if (!files || !Array.isArray(files) || files.length === 0) {
        return new Response(JSON.stringify({ error: "No files provided" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const categoryList = categories?.map((c: any) => `- ${c.name} (id: ${c.id})`).join("\n") || "No categories available";
      
      const filesList = files.map((f: any, i: number) => 
        `File ${i + 1}: filename="${f.filename}", size=${f.fileSize} bytes`
      ).join("\n");

      const prompt = `Analyze these FiveM mod files and suggest metadata for each one.

Available categories:
${categoryList}

Files to analyze:
${filesList}

For each file, suggest: a clean name, brief description, best category_id, and version number (default "1.0").`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            { role: "system", content: "You are a FiveM mod analyst. Analyze mod filenames and return structured metadata. Always respond with the tool call." },
            { role: "user", content: prompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "batch_mod_analysis",
                description: "Return analyzed metadata for multiple mods",
                parameters: {
                  type: "object",
                  properties: {
                    results: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          name: { type: "string", description: "Clean human-readable mod name" },
                          description: { type: "string", description: "Brief description" },
                          category_id: { type: "string", description: "Best matching category ID" },
                          version: { type: "string", description: "Version number" },
                        },
                        required: ["name", "description", "version"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["results"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "batch_mod_analysis" } },
        }),
      });

      clearTimeout(timeout);
      if (!response.ok) {
        const errorText = await response.text();
        console.error("AI gateway error:", response.status, errorText);
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limited, try again later" }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw new Error(`AI gateway error: ${response.status}`);
      }

      const data = await response.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        const parsed = JSON.parse(toolCall.function.arguments);
        return new Response(JSON.stringify({ results: parsed.results || [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fallback: return empty results
      const fallbackResults = files.map((f: any) => ({
        name: f.filename.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "),
        description: "",
        version: "1.0",
      }));
      return new Response(JSON.stringify({ results: fallbackResults }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === ADVANCED MODE ===
    if (mode === "advanced") {
      const { filename, fileSize, modName, modDescription } = body;
      const prompt = `Generate advanced metadata for this FiveM mod.

Mod name: ${modName || filename}
Description: ${modDescription || "No description"}
Filename: ${filename}
File size: ${fileSize} bytes

Generate realistic and helpful:
1. A changelog for v1.0 (bullet points)
2. Requirements/dependencies needed
3. Compatibility info (FiveM version, framework)
4. Author notes with installation instructions`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            { role: "system", content: "You are a FiveM mod expert. Generate helpful metadata for mod uploads. Always respond with the tool call." },
            { role: "user", content: prompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "advanced_metadata",
                description: "Return advanced mod metadata",
                parameters: {
                  type: "object",
                  properties: {
                    changelog: { type: "string", description: "Version changelog with bullet points" },
                    requirements: { type: "string", description: "Required dependencies and mods" },
                    compatibility: { type: "string", description: "Compatibility info (FiveM version, framework)" },
                    author_notes: { type: "string", description: "Installation instructions and credits" },
                  },
                  required: ["changelog", "requirements", "compatibility", "author_notes"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "advanced_metadata" } },
        }),
      });

      clearTimeout(timeout);
      if (!response.ok) {
        const errorText = await response.text();
        console.error("AI gateway error:", response.status, errorText);
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limited, try again later" }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw new Error(`AI gateway error: ${response.status}`);
      }

      const data = await response.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        const advanced = JSON.parse(toolCall.function.arguments);
        return new Response(JSON.stringify({ advanced }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ advanced: { changelog: "", requirements: "", compatibility: "", author_notes: "" } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === DEFAULT: single file analysis ===
    const { filename, fileSize, categories } = body;
    const categoryList = categories?.map((c: any) => `- ${c.name} (id: ${c.id})`).join("\n") || "No categories available";

    const prompt = `Analyze this FiveM mod file and suggest metadata.

Filename: ${filename}
File size: ${fileSize} bytes

Available categories:
${categoryList}

Based on the filename, suggest:
1. A clean, human-readable name for the mod
2. A brief description of what this mod likely does
3. The most appropriate category_id from the list above
4. A version number (default "1.0" if not detectable from filename)`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 50000);
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "You are a FiveM mod analyst. Analyze mod filenames and return structured metadata. Always respond with the tool call." },
          { role: "user", content: prompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "mod_analysis",
              description: "Return analyzed mod metadata",
              parameters: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Clean human-readable mod name" },
                  description: { type: "string", description: "Brief description of what the mod does" },
                  category_id: { type: "string", description: "Best matching category ID" },
                  version: { type: "string", description: "Version number" },
                },
                required: ["name", "description", "version"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "mod_analysis" } },
      }),
    });

    clearTimeout(timeout);
    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, try again later" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (toolCall?.function?.arguments) {
      const analysis = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify({ analysis }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fallbackName = filename.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
    return new Response(JSON.stringify({ 
      analysis: { name: fallbackName, description: "", version: "1.0" } 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("analyze-mod error:", error);

    // If the request was aborted (timeout), return fallback data instead of 500
    const isAbort = error.name === "AbortError" || (error.message && error.message.includes("aborted"));
    if (isAbort) {
      const fallbackName = (body?.filename || "mod").replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
      const fallbackResponse: Record<string, unknown> = {};

      if (body?.mode === "advanced") {
        fallbackResponse.advanced = { changelog: "", requirements: "", compatibility: "", author_notes: "" };
      } else if (body?.mode === "batch") {
        fallbackResponse.results = (body?.files || []).map((f: any) => ({
          name: (f.filename || "mod").replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "),
          description: "",
          version: "1.0",
        }));
      } else {
        fallbackResponse.analysis = { name: fallbackName, description: "", version: "1.0" };
      }
      fallbackResponse.fallback = true;

      return new Response(JSON.stringify(fallbackResponse), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
