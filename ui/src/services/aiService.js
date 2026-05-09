const AI_CONFIG_KEY = "rekonstrike_ai_config";

export function getAIConfig() {
  try {
    const raw = localStorage.getItem(AI_CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveAIConfig(config) {
  localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(config));
}

export function clearAIConfig() {
  localStorage.removeItem(AI_CONFIG_KEY);
}

function buildPrompt(findings, platform, targetUrl, mode) {
  const findingText = findings.map((f, i) =>
    `Finding ${i + 1}:
- Title: ${f.title || "Untitled"}
- Severity: ${f.severity || "medium"}
- URL: ${f.url || targetUrl || "N/A"}
- Steps: ${f.steps || "N/A"}
- Impact: ${f.impact || "N/A"}
- Request: ${f.request || "N/A"}
- Response: ${f.response || "N/A"}
- Module: ${f.module || "N/A"}`
  ).join("\n\n");

  if (mode === "enhance") {
    return `You are a professional bug bounty report writer. Enhance the following security findings for a ${platform} bug bounty report targeting ${targetUrl}. For each finding:

1. Improve the title to be clear and professional
2. Improve the steps to reproduce to be precise and actionable
3. Generate a compelling impact statement that justifies the severity
4. Suggest the correct severity if applicable
5. Keep all technical details intact — only improve language and clarity

Return the response as a JSON array where each element has: { "title": string, "steps": string, "impact": string, "severity": string, "remediation": string }

Findings:
${findingText}

IMPORTANT: Return ONLY valid JSON. No markdown, no code fences, no extra text.`;
  }

  if (mode === "executive_summary") {
    return `You are a professional security report writer. Write an executive summary paragraph for a security assessment of ${targetUrl}. The assessment found ${findings.length} vulnerabilities. Here are the findings:

${findingText}

Write 2-3 paragraphs summarizing the security posture, critical risks, and recommended actions. Be professional and concise.

IMPORTANT: Return ONLY the summary text. No markdown, no code fences.`;
  }

  return "";
}

export async function enhanceFindings(findings, platform, targetUrl, onProgress) {
  const config = getAIConfig();
  if (!config || !config.apiKey) {
    throw new Error("AI not configured. Set your API key in the report generator settings.");
  }

  const prompt = buildPrompt(findings, platform, targetUrl, "enhance");
  if (onProgress) onProgress("Sending findings for AI enhancement...");

  const body = {
    model: config.model || "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are a professional bug bounty report writer. You output ONLY valid JSON arrays." },
      { role: "user", content: prompt },
    ],
    temperature: 0.3,
    max_tokens: 4000,
  };

  const res = await fetch(config.baseUrl || "https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    throw new Error(`AI API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI returned empty response");

  if (onProgress) onProgress("Processing AI response...");

  const cleaned = content.replace(/```(json)?\n?/gi, "").trim();

  let enhanced;
  try {
    enhanced = JSON.parse(cleaned);
  } catch {
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        enhanced = JSON.parse(jsonMatch[0]);
      } catch {
        throw new Error("AI response was not valid JSON. Please try again.");
      }
    } else {
      throw new Error("AI response was not valid JSON. Please try again.");
    }
  }

  if (!Array.isArray(enhanced)) {
    throw new Error("AI response was not an array. Please try again.");
  }

  return findings.map((f, i) => {
    const ai = enhanced[i];
    if (!ai) return f;
    return {
      ...f,
      title: ai.title || f.title,
      steps: ai.steps || f.steps,
      impact: ai.impact || f.impact,
      severity: ai.severity || f.severity,
      remediation: ai.remediation || f.remediation,
      _aiEnhanced: true,
    };
  });
}

export async function generateExecutiveSummary(findings, targetUrl, onProgress) {
  const config = getAIConfig();
  if (!config || !config.apiKey) {
    throw new Error("AI not configured.");
  }

  const prompt = buildPrompt(findings, "Generic", targetUrl, "executive_summary");
  if (onProgress) onProgress("Generating executive summary...");

  const body = {
    model: config.model || "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are a professional security report writer. Output ONLY the requested text with no formatting." },
      { role: "user", content: prompt },
    ],
    temperature: 0.4,
    max_tokens: 1000,
  };

  const res = await fetch(config.baseUrl || "https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    throw new Error(`AI API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI returned empty response");

  if (onProgress) onProgress("Summary generated");
  return content.trim();
}
