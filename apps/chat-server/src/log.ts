type Fields = Record<string, unknown>;

// What an error looks like in a log line; the stack is what finds the cause afterwards.
function describe(error: unknown): unknown {
  return error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : error;
}

// One JSON object per line, so a log collector can filter on the fields instead of reading sentences.
function write(level: "info" | "error", message: string, extra: Fields): void {
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    message,
    ...extra,
  });

  if (level === "error") console.error(line);
  else console.log(line);
}

export const log = {
  info(message: string, fields: Fields = {}): void {
    write("info", message, fields);
  },

  error(message: string, error?: unknown, fields: Fields = {}): void {
    write("error", message, {
      ...fields,
      ...(error === undefined ? {} : { error: describe(error) }),
    });
  },
};
