export const ENTITY_AI_MAX_RUN_GROUPS = 250;
export const ENTITY_AI_PROVIDER_BATCH_SIZE = 8;

export function chunkEntityAiItems<T>(items: T[], size = ENTITY_AI_PROVIDER_BATCH_SIZE): T[][] {
  if (!Number.isInteger(size) || size < 1 || size > ENTITY_AI_PROVIDER_BATCH_SIZE) {
    throw new Error("invalid_entity_ai_batch_size");
  }

  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}
