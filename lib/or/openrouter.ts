type StructuredCallInput = {
  name: string;
  schema: unknown;
  system: string;
  user: string;
};

function getOpenRouterConfig() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || "openai/gpt-5.4-mini";
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is required.");
  return { apiKey, model };
}

export async function callStructured({ name, schema, system, user }: StructuredCallInput) {
  const { apiKey, model } = getOpenRouterConfig();
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "or-emergency-transfer-demo-app",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name,
          strict: true,
          schema,
        },
      },
      provider: {
        require_parameters: true,
        data_collection: "deny",
      },
      stream: false,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenRouter request failed: ${response.status} ${body}`);
  }

  const json = await response.json();
  const content = json.choices?.[0]?.message?.content;
  if (typeof content === "string") return JSON.parse(content);
  if (content && typeof content === "object") return content;
  throw new Error(`OpenRouter returned no parseable message content for ${name}.`);
}
