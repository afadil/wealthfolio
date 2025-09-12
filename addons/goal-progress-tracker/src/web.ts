export async function load() {
  const mod = await import("./index");
  return mod.default;
}
