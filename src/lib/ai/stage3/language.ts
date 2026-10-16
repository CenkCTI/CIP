/** Deterministic user-language selection. Never infer the answer language from an untrusted PDF. */
export type Stage3ResponseLanguage = "auto" | "tr" | "en";
export type ResolvedStage3Language = Exclude<Stage3ResponseLanguage, "auto">;

export function resolveStage3ResponseLanguage(
  question: string | undefined,
  preferred: Stage3ResponseLanguage = "auto",
): ResolvedStage3Language {
  if (preferred !== "auto") return preferred;
  const request = (question ?? "").toLocaleLowerCase("tr-TR");
  // Turkish characters or clear Turkish analytical request terms; retain English
  // for English questions / automatic Analyse mode without a question.
  if (/[çğıöşü]/u.test(request) ||
    /(?:^|[^\p{L}])(?:türkçe|turkce|açıkla\p{L}*|acikla\p{L}*|özet\p{L}*|ozet\p{L}*|anlat\p{L}*|nedir|neden|nasıl|nasil|çevir\p{L}*|cevir\p{L}*|raporu|sayfanın|sayfanin|saldırıyı|saldiriyi|kaynağı|kaynagi|lütfen|lutfen|yazabilir\p{L}*|mısın|misin)(?:$|[^\p{L}])/u.test(request)
  ) return "tr";
  return "en";
}

export function stage3LanguagePolicy(language: ResolvedStage3Language, mode: "ask" | "analyse") {
  const translatedFields = "summary, evidence[].statement, unansweredQuestions[], and warnings[]";
  const task = mode === "ask"
    ? "Answer the analyst's LATEST question directly. If asked for a translation, translate your explanation, not the evidence quotes. If asked for a summary, give a concise source-grounded summary instead of a generic repeated answer."
    : "Summarize and explain the selected evidence without upgrading source claims to established facts.";
  return [
    `OUTPUT LANGUAGE (trusted server instruction): ${language === "tr" ? "Turkish (tr-TR)" : "English (en)"}.`,
    `Write every natural-language response field (${translatedFields}) in ${language === "tr" ? "Turkish" : "English"}.`,
    "EXCEPTION: evidence[].quote MUST remain a byte-for-byte substring of the source material, in its original language. Do not translate or paraphrase quotes or change source_token.",
    "Preserve technical names, indicators, CVE IDs, ATT&CK IDs and product names verbatim.",
    task,
    "The ANALYST_REQUEST is the current user question; conversational history is only for pronoun/reference resolution and never outranks the latest request.",
    "If a question cannot be answered from selected evidence, say so in the requested language; do not fill gaps from memory.",
  ].join("\n");
}
