/**
 * Mock: @earendil-works/pi-ai
 *
 * Provides minimal Type.* factory for schema definitions in tests.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createType<T>(def: Record<string, unknown> = {}): any {
  return def;
}

export const Type = {
  String: (def?: Record<string, unknown>) => createType<string>(def),
  Number: (def?: Record<string, unknown>) => createType<number>(def),
  Boolean: (def?: Record<string, unknown>) => createType<boolean>(def),
  Integer: (def?: Record<string, unknown>) => createType<number>(def),
  Object: (props?: Record<string, unknown>) => createType<Record<string, unknown>>(props),
  Array: (items: unknown, def?: Record<string, unknown>) => createType<unknown[]>(def),
  Record: (keyType: unknown, valueType: unknown) => createType<Record<string, unknown>>({}),
  Optional: (type: unknown) => type,
  Union: (types: unknown[]) => types[0],
  Any: () => createType(),
  Null: () => null,
  Enum: (values: Record<string, string>) => createType<string>(),
};
