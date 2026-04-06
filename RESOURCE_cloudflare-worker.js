// Copy this code into your Cloudflare Worker script

export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
      "Access-Control-Max-Age": "86400",
      "Content-Type": "application/json",
    };

    try {
      // Handle CORS preflight requests
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
      }

      // Only accept POST requests from the chat app.
      if (request.method !== "POST") {
        return new Response(
          JSON.stringify({
            error: "Use POST with a JSON body containing messages.",
          }),
          { status: 405, headers: corsHeaders },
        );
      }

      const apiKey =
        typeof env.OPENAI_API_KEY === "string" ? env.OPENAI_API_KEY.trim() : ""; // Make sure to name your secret OPENAI_API_KEY in the Cloudflare Workers dashboard
      const apiUrl = "https://api.openai.com/v1/chat/completions";
      if (!apiKey) {
        return new Response(
          JSON.stringify({
            error: "Missing OPENAI_API_KEY secret in the deployed worker.",
          }),
          { status: 500, headers: corsHeaders },
        );
      }
      let userInput;

      try {
        userInput = await request.json();
      } catch (error) {
        return new Response(
          JSON.stringify({
            error: "Invalid JSON body. Send { messages: [...] }.",
          }),
          { status: 400, headers: corsHeaders },
        );
      }

      if (!userInput || !Array.isArray(userInput.messages)) {
        return new Response(
          JSON.stringify({
            error: "Missing messages array in the request body.",
          }),
          { status: 400, headers: corsHeaders },
        );
      }

      // Server-side scope guard so the chatbot stays focused on L'Oreal/body care.
      const scopeSystemMessage = {
        role: "system",
        content:
          "You are a L'Oreal beauty assistant. Only answer questions about L'Oreal products and body/beauty care topics (skincare, makeup, haircare, fragrance, scalp care, body care). If the request is out of scope, politely refuse in one sentence and ask a beauty-related follow-up question.",
      };

      const requestBody = {
        model: "gpt-4o",
        messages: [scopeSystemMessage, ...userInput.messages],
        temperature:
          typeof userInput.temperature === "number"
            ? userInput.temperature
            : 0.7,
        max_completion_tokens: 300,
      };

      const openaiHeaders = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      };

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: openaiHeaders,
        body: JSON.stringify(requestBody),
      });

      const responseText = await response.text();

      if (!response.ok) {
        return new Response(
          JSON.stringify({
            error: "OpenAI request failed.",
            details: responseText,
          }),
          { status: response.status, headers: corsHeaders },
        );
      }

      let data;

      try {
        data = JSON.parse(responseText);
      } catch (error) {
        return new Response(
          JSON.stringify({
            error: "OpenAI returned invalid JSON.",
            details: responseText,
          }),
          { status: 502, headers: corsHeaders },
        );
      }

      return new Response(JSON.stringify(data), { headers: corsHeaders });
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: "Worker crashed before it could complete the request.",
          details: error instanceof Error ? error.message : String(error),
        }),
        { status: 500, headers: corsHeaders },
      );
    }
  },
};
