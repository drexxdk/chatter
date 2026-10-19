const profileLocks = new Map<string, Promise<void>>();

export function withProfileLock<Result>(
  key: string,
  operation: () => Promise<Result>,
): Promise<Result> {
  const result = (profileLocks.get(key) ?? Promise.resolve()).then(operation);
  const tail = result.then(
    () => {},
    () => {},
  );
  profileLocks.set(key, tail);
  void tail.then(() => {
    if (profileLocks.get(key) === tail) profileLocks.delete(key);
  });
  return result;
}
