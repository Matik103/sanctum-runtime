const OPENROUTER_URL = 'https://openrouter.ai/api/v1'

export function fitEmbeddingVector(vec: number[], targetDims: number): number[] {
  if (vec.length === targetDims) return vec
  const sliced = vec.slice(0, targetDims)
  let sumSq = 0
  for (const v of sliced) sumSq += v * v
  const norm = Math.sqrt(sumSq)
  if (!norm) return sliced
  return sliced.map((v) => v / norm)
}

export async function embedTexts(
  apiKey: string,
  model: string,
  inputs: string[],
  targetDims: number,
): Promise<(number[] | null)[]> {
  if (!inputs.length) return []
  const res = await fetch(`${OPENROUTER_URL}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://www.sanctumruntime.com',
      'X-Title': 'Sanctum Guide',
    },
    body: JSON.stringify({ model, input: inputs }),
  })
  if (!res.ok) return inputs.map(() => null)
  const json = (await res.json()) as { data?: { embedding?: number[]; index?: number }[] }
  const byIndex = new Map<number, number[]>()
  for (const row of json.data ?? []) {
    if (row.embedding?.length && row.index !== undefined) {
      byIndex.set(row.index, fitEmbeddingVector(row.embedding, targetDims))
    }
  }
  return inputs.map((_, i) => byIndex.get(i) ?? null)
}
