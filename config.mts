import { readFileSync } from "node:fs";

import { isNode, LineCounter, parseDocument } from "yaml";

type ConfigSection = "client" | "server";

export function readConfigSection(section: ConfigSection): unknown {
  let source;
  try {
    source = readFileSync(new URL("./config.yaml", import.meta.url), "utf8");
  } catch {
    throw new Error(
      "无法读取 config.yaml。请从 config.example.yaml 复制并填写。",
    );
  }

  return parseConfigSection(source, section);
}

export function parseConfigSection(
  source: string,
  section: ConfigSection,
): unknown {
  const lineCounter = new LineCounter();
  const document = parseDocument(source, {
    lineCounter,
    logLevel: "error",
    prettyErrors: false,
    stringKeys: true,
  });
  const issue = document.errors[0] ?? document.warnings[0];
  if (issue) {
    const { line, col } = lineCounter.linePos(issue.pos[0]);
    throw new Error(
      `config.yaml 第 ${line} 行第 ${col} 列的 YAML 无效（${issue.code}）。`,
    );
  }

  const value = document.get(section, true);
  if (!isNode(value)) {
    throw new Error(`config.yaml 缺少 ${section} 配置。`);
  }

  try {
    // Prevent YAML aliases from copying private server values into public fields.
    return value.toJS(document, { maxAliasCount: 0 });
  } catch (error) {
    if (error instanceof ReferenceError) {
      throw new Error("config.yaml 不支持 YAML 别名。");
    }
    throw new Error(`config.yaml 中的 ${section} 配置无法转换。`);
  }
}

type ConfigIssue = {
  code: string;
  message: string;
  path: readonly PropertyKey[];
};

export function configValidationError(
  section: ConfigSection,
  issues: readonly ConfigIssue[],
): Error {
  const details = issues.map(({ code, message, path }) => {
    const hasUntrustedKey =
      code === "invalid_key" || (path.length > 1 && path[0] === "metadata");
    const fields = hasUntrustedKey ? path.slice(0, -1) : path;
    const reason = code === "unrecognized_keys" ? "包含未定义的字段" : message;
    return `${[section, ...fields].map(String).join(".")} (${reason})`;
  });
  return new Error(
    `config.yaml 中的 ${section} 配置无效。\n${details.join("\n")}`,
  );
}
