let pending: Promise<unknown> = Promise.resolve();

export function withMemberNamesLock<Result>(
  operation: () => Promise<Result>,
): Promise<Result> {
  const result = pending.then(operation);
  pending = result.catch(() => undefined);
  return result;
}
