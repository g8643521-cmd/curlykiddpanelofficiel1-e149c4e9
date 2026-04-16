const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DISCORD_API = "https://discord.com/api/v10";

// Ed25519 signature verification for Discord interactions
async function verifyDiscordSignature(
  body: string,
  signature: string,
  timestamp: string,
  publicKey: string,
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const keyBytes = hexToUint8Array(publicKey);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "Ed25519", namedCurve: "Ed25519" },
      false,
      ["verify"],
    );

    const sigBytes = hexToUint8Array(signature);
    const message = encoder.encode(timestamp + body);

    return await crypto.subtle.verify("Ed25519", cryptoKey, sigBytes, message);
  } catch (err) {
    console.error("Signature verification error:", err);
    return false;
  }
}

function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const DISCORD_PUBLIC_KEY = Deno.env.get("DISCORD_PUBLIC_KEY");
    
    const signature = req.headers.get("x-signature-ed25519") || "";
    const timestamp = req.headers.get("x-signature-timestamp") || "";
    const bodyText = await req.text();

    // Verify signature if public key is configured and signature headers present
    if (DISCORD_PUBLIC_KEY && signature && timestamp) {
      const isValid = await verifyDiscordSignature(bodyText, signature, timestamp, DISCORD_PUBLIC_KEY);
      if (!isValid) {
        return new Response("Invalid signature", { status: 401 });
      }
    }

    const body = JSON.parse(bodyText);
    const interactionType = body.type;

    // Type 1 = PING (verification)
    if (interactionType === 1) {
      return new Response(JSON.stringify({ type: 1 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Type 3 = MESSAGE_COMPONENT (button clicks)
    if (interactionType === 3) {
      const customId: string = body.data?.custom_id || "";
      const DISCORD_BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN");

      if (!DISCORD_BOT_TOKEN) {
        return respond(4, "❌ Bot token not configured.");
      }

      // ── Delete Channels ──
      if (customId.startsWith("curlykidd_delete_")) {
        const channelIds = customId.replace("curlykidd_delete_", "").split(",").filter(Boolean);

        if (channelIds.length === 0) {
          return respond(4, "No channels found to delete.");
        }

        // Acknowledge with deferred update
        const ackRes = respond(6);

        const deleteWork = (async () => {
          const deleted: string[] = [];
          const failed: string[] = [];

          for (const channelId of channelIds) {
            try {
              const res = await fetch(`${DISCORD_API}/channels/${channelId}`, {
                method: "DELETE",
                headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
              });
              if (res.ok) {
                deleted.push(channelId);
              } else {
                failed.push(channelId);
              }
            } catch {
              failed.push(channelId);
            }
          }

          // DM the user who clicked
          const userId = body.member?.user?.id || body.user?.id;
          if (userId) {
            try {
              const dmRes = await fetch(`${DISCORD_API}/users/@me/channels`, {
                method: "POST",
                headers: {
                  Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ recipient_id: userId }),
              });

              if (dmRes.ok) {
                const dm = (await dmRes.json()) as any;
                const BOT_LOGO = "https://ucjpepubcxhtjxumowwj.supabase.co/storage/v1/object/public/public-assets/bot-avatar.png";

                await fetch(`${DISCORD_API}/channels/${dm.id}/messages`, {
                  method: "POST",
                  headers: {
                    Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    embeds: [{
                      author: { name: "CurlyKidd Anti-Cheat", icon_url: BOT_LOGO },
                      title: "Channels Deleted",
                      description: [
                        `Successfully deleted **${deleted.length}** channel(s).`,
                        failed.length > 0 ? `Failed to delete **${failed.length}** channel(s).` : "",
                        "",
                        "You can re-add the bot and create new channels anytime from the [CurlyKidd Panel](https://curlykiddpanel.lovable.app/bot).",
                      ].filter(Boolean).join("\n"),
                      color: deleted.length > 0 ? 0x00D9A3 : 0xED4245,
                      thumbnail: { url: BOT_LOGO },
                      timestamp: new Date().toISOString(),
                      footer: { text: "CurlyKidd Panel • Security & Protection", icon_url: BOT_LOGO },
                    }],
                  }),
                });
              }
            } catch {
              // DM failed, ignore
            }
          }
        })();

        try {
          (globalThis as any).EdgeRuntime?.waitUntil?.(deleteWork);
        } catch {
          void deleteWork;
        }

        return ackRes;
      }

      // ── Contact Support ──
      if (customId.startsWith("curlykidd_support_")) {
        const BOT_LOGO = "https://ucjpepubcxhtjxumowwj.supabase.co/storage/v1/object/public/public-assets/bot-avatar.png";

        return respond(4, undefined, {
          embeds: [{
            author: { name: "CurlyKidd Anti-Cheat", icon_url: BOT_LOGO },
            title: "Contact Support",
            description: [
              "Need help? Our team is ready to assist you.",
              "",
              "**Options:**",
              "• Visit the [CurlyKidd Dashboard](https://curlykiddpanel.lovable.app)",
              "• Open a ticket in our support server",
              "",
              "A support representative has been notified and will reach out shortly.",
            ].join("\n"),
            color: 0x5865F2,
            thumbnail: { url: BOT_LOGO },
            timestamp: new Date().toISOString(),
            footer: { text: "CurlyKidd Panel • Support", icon_url: BOT_LOGO },
          }],
          flags: 64,
        });
      }

      return respond(4, "Unknown interaction.", undefined, true);
    }

    return new Response(JSON.stringify({ error: "Unhandled interaction type" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Discord interaction error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function respond(type: number, content?: string, data?: any, ephemeral = false) {
  const responseData: any = data || {};
  if (content) responseData.content = content;
  if (ephemeral && !data?.flags) responseData.flags = 64;

  return new Response(
    JSON.stringify({ type, data: Object.keys(responseData).length > 0 ? responseData : undefined }),
    { headers: { "Content-Type": "application/json" } },
  );
}
