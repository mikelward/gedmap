const HERE_API_KEY = import.meta.env.VITE_HERE_API_KEY

const cache = new Map<string, Promise<GeocodeResult | null>>()

export type FeatureType =
  | 'address'
  | 'street'
  | 'neighborhood'
  | 'locality'
  | 'place'
  | 'postcode'
  | 'district'
  | 'region'
  | 'country'

export interface GeoFeature {
  geometry: {
    type: 'Point'
    coordinates: [number, number]
  }
  properties: {
    name?: string
    full_address?: string
    feature_type: FeatureType
    context: {
      country: {
        name?: string
        country_code?: string
      }
    }
  }
}

type SearchFn = (query: string) => Promise<GeoFeature[]>

export interface GeocodeResult {
  lat: number
  lng: number
  country: string
}

interface HereResultItem {
  title: string
  position: { lat: number; lng: number }
  resultType?: string
  address?: {
    label?: string
    countryName?: string
    countryCode?: string
  }
}

// Specificity by feature_type — lower = more specific.
export const SPECIFICITY: Record<FeatureType, number> = {
  address: 0,
  street: 1,
  neighborhood: 2,
  locality: 3,
  place: 4,
  postcode: 5,
  district: 6,
  region: 7,
  country: 8,
}

// Map HERE resultType to a specificity feature_type.
export function hereFeatureType(resultType: string | undefined): FeatureType {
  switch (resultType) {
    case 'houseNumber':
      return 'address'
    case 'street':
      return 'street'
    case 'locality':
      return 'place'
    case 'administrativeArea':
      return 'region'
    default:
      return 'place'
  }
}

// Query HERE Geocoding API. Returns features in a common format.
/**
 * Why a geocode lookup could not be performed at all.
 *
 * `quota` is the one this class exists for: HERE's free tier is 250k
 * requests/month, and an exhausted quota answers 429. Returning `[]` for that
 * made it indistinguishable from "we looked and this place doesn't exist",
 * so every ancestor silently landed in the unmapped list and the app looked
 * broken rather than rate-limited.
 */
export type GeocoderUnavailableReason =
  | 'quota'
  | 'rate-limited'
  | 'auth'
  | 'network'
  | 'unconfigured'

/**
 * Thrown when the geocoder could not answer the question — as opposed to
 * answering "no match", which stays an empty feature list. Callers must keep
 * the two apart: a no-match is a fact about the place, an unavailable is a
 * fact about us, and only the second one is worth telling the user about.
 *
 * Carries no query text by design — a birth place is GEDCOM record detail
 * (AGENTS.md "Privacy"), so only the status code travels with the error.
 */
export class GeocoderUnavailableError extends Error {
  readonly reason: GeocoderUnavailableReason
  readonly status?: number

  constructor(reason: GeocoderUnavailableReason, status?: number, options?: ErrorOptions) {
    super(`geocoder unavailable: ${reason}${status ? ` (HTTP ${status})` : ''}`, options)
    this.name = 'GeocoderUnavailableError'
    this.reason = reason
    this.status = status
  }
}

/**
 * Whether a reason can't clear on its own inside one run: the month's quota is
 * gone, the key is bad, there is no key. `network` and `rate-limited` are the
 * opposite — each can be a single blip — and that difference decides both
 * whether the batch latches and whether a partial answer is safe to cache.
 */
export function isTerminal(reason: GeocoderUnavailableReason): boolean {
  return reason !== 'network' && reason !== 'rate-limited'
}

/**
 * Map an HTTP status from HERE onto the reason the caller should act on.
 *
 * 429 is deliberately NOT `quota`. HERE answers 429 both for an exhausted
 * plan allowance and for exceeding its short-term request rate, and the two
 * are indistinguishable from one response — so with concurrent lookups in
 * flight, one burst would otherwise latch the whole batch and tell the user
 * their monthly allowance was gone. Treat it as transient here and let
 * `geocodeAncestors` decide from evidence: a burst clears, an exhausted
 * allowance keeps answering 429, and only the second one earns the latch.
 */
export function reasonForStatus(status: number): GeocoderUnavailableReason {
  if (status === 429) return 'rate-limited'
  if (status === 401 || status === 403) return 'auth'
  return 'network'
}

/**
 * How long to wait before retrying a 429 when HERE sends no `Retry-After`,
 * and the ceiling on one it does send. A burst limit clears in about a
 * second; anything longer is not worth blocking a tree render on, so we give
 * up the retry and let the batch's own evidence decide (see above).
 */
const RATE_LIMIT_RETRY_MS = 600
const RATE_LIMIT_RETRY_CAP_MS = 2000

let retryDelayMs = RATE_LIMIT_RETRY_MS

/**
 * When any lookup sees a 429, every other lookup holds off until this time.
 *
 * Retrying per-request is not enough on its own: lookups run concurrently, so
 * a burst hits all of them at once, they each sleep the same interval, and
 * they retry in the same instant — recreating the burst and manufacturing the
 * repeated failures that the batch reads as an exhausted allowance. Shared
 * state is what turns "each request backs off" into "the batch backs off".
 */
let rateLimitedUntil = 0

/**
 * Test-only: shorten the 429 backoff so the retry path is cheap to exercise,
 * and clear the shared gate, which is module state that would otherwise leak
 * a pause from one test into the next.
 */
export function _setRateLimitRetryDelayForTests(ms: number | null): void {
  retryDelayMs = ms ?? RATE_LIMIT_RETRY_MS
  rateLimitedUntil = 0
}

/**
 * Spread retries that would otherwise fire in the same instant. Proportional
 * to the delay, so a test that sets the delay to zero stays deterministic.
 */
function jitter(delayMs: number): number {
  return Math.random() * delayMs * 0.5
}

/** Hold until any shared rate-limit pause has expired. */
async function awaitRateLimitGate(): Promise<void> {
  const wait = rateLimitedUntil - Date.now()
  if (wait > 0) await sleep(wait + jitter(retryDelayMs))
}

/**
 * `Retry-After` in seconds, clamped to our own ceiling. Absent, malformed, or
 * an HTTP-date (which HERE does not send for rate limiting) all fall back to
 * the default — a wrong-but-short wait costs one request, where trusting an
 * arbitrary value could stall the render for minutes.
 */
function retryAfterMs(res: Response): number {
  const header = res.headers?.get?.('Retry-After')
  const seconds = header === null || header === undefined ? NaN : Number(header)
  if (!Number.isFinite(seconds) || seconds < 0) return retryDelayMs
  return Math.min(seconds * 1000, RATE_LIMIT_RETRY_CAP_MS)
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function hereSearch(query: string): Promise<GeoFeature[]> {
  if (!HERE_API_KEY) throw new GeocoderUnavailableError('unconfigured')
  const params = new URLSearchParams({
    q: query,
    limit: '5',
    apiKey: HERE_API_KEY,
  })
  const url = `https://geocode.search.hereapi.com/v1/geocode?${params}`
  const attempt = async (): Promise<Response> => {
    try {
      return await fetch(url)
    } catch (e) {
      // Offline, DNS failure, CORS — the lookup never reached HERE, so we know
      // nothing about whether the place exists. Never log `query`: a birth place
      // is GEDCOM record detail (see AGENTS.md "Privacy").
      throw new GeocoderUnavailableError('network', undefined, { cause: e })
    }
  }
  await awaitRateLimitGate()
  let res = await attempt()
  if (res.status === 429) {
    // Retry once. A short-term rate limit clears in about a second, and
    // recovering here is what keeps a burst from costing this ancestor its
    // position on the map at all — not latching is only half the fix.
    const delay = retryAfterMs(res)
    // Hold every *other* in-flight and queued lookup back too, so the retry
    // isn't racing the same burst that caused it.
    rateLimitedUntil = Math.max(rateLimitedUntil, Date.now() + delay)
    await sleep(delay + jitter(delay))
    res = await attempt()
  }
  if (!res.ok) throw new GeocoderUnavailableError(reasonForStatus(res.status), res.status)
  try {
    const data = (await res.json()) as { items?: HereResultItem[] }
    return (data.items || []).map((item) => ({
      geometry: {
        type: 'Point' as const,
        coordinates: [item.position.lng, item.position.lat] as [number, number],
      },
      properties: {
        name: item.title,
        full_address: item.address?.label,
        feature_type: hereFeatureType(item.resultType),
        context: {
          country: {
            name: item.address?.countryName,
            country_code: item.address?.countryCode,
          },
        },
      },
    }))
  } catch (e) {
    // HERE answered 2xx with a body we couldn't parse. That's a broken
    // response, not an absent place, so it must not read as "no match".
    throw new GeocoderUnavailableError('network', res.status, { cause: e })
  }
}

interface BestFeature {
  feature: GeoFeature
  specificity: number
}

// Pick the best feature from a list — trusts the API's relevance order
// and just reads specificity from the first result.
export function pickBestFeature(features: GeoFeature[]): BestFeature | null {
  if (features.length === 0) return null
  const best = features[0]
  const specificity = SPECIFICITY[best.properties?.feature_type] ?? 4
  return { feature: best, specificity }
}

export interface SplitPlace {
  parts: string[]
  spaceParts: string[] | null
}

// Split a GEDCOM place string into parts for progressive querying.
export function splitPlace(place: string): SplitPlace {
  // Drop empty segments — exports often leave blank jurisdiction slots
  // ("Brooklyn, , New York, USA,") that would produce garbage queries.
  const parts = place.split(',').map((s) => s.trim()).filter(Boolean)
  // Fall back to space-splitting only when it produces a genuinely
  // different query — for a single word it would just repeat parts.
  const spaceTokens = place.trim().split(/\s+/)
  const spaceParts =
    place.includes(',') || spaceTokens.length < 2 ? null : spaceTokens
  return { parts, spaceParts }
}

// Core geocoding logic: progressive query shortening.
// searchFn(query) → features[]
export async function tryGeocode(
  parts: string[],
  searchFn: SearchFn,
  onUnavailable?: (e: GeocoderUnavailableError) => void
): Promise<GeocodeResult | null> {
  let bestFeature: GeoFeature | null = null
  let bestSpecificity = Infinity

  for (let i = 0; i < parts.length; i++) {
    const query = parts.slice(i).join(', ')
    let features: GeoFeature[]
    try {
      features = await searchFn(query)
    } catch (e) {
      if (!(e instanceof GeocoderUnavailableError)) throw e
      // The batch still needs to hear about this — it decides the latch and
      // the reported reason — but a broad match already in hand is a place we
      // CAN plot, and throwing past it would drop the ancestor onto the
      // unmapped list for a request that was only ever refining an answer we
      // already had.
      onUnavailable?.(e)
      if (bestFeature) break
      throw e
    }
    const pick = pickBestFeature(features)
    if (!pick) continue

    if (!bestFeature || pick.specificity < bestSpecificity) {
      bestFeature = pick.feature
      bestSpecificity = pick.specificity
    }

    // Stop once we have a city-level (or better) hit — the remaining
    // queries are strictly broader and can't improve on it. HERE maps
    // city results to 'place', so the threshold must include it.
    if (pick.specificity <= SPECIFICITY.place) break
  }

  if (!bestFeature) return null

  const [lng, lat] = bestFeature.geometry.coordinates
  // HERE's structured country, when it gave one. Kept separate from `country`
  // below because only this value is safe to log: the fallback is a slice of
  // the user's own place string.
  const apiCountry = bestFeature.properties?.context?.country?.name
  const country = apiCountry || parts[parts.length - 1] || 'Unknown'

  // Sanitized: shape only. This used to log `parts.join(', ')` — the raw birth
  // place — plus the matched `full_address`, which for a house-number hit is a
  // street address. Both are GEDCOM record detail and neither may be logged
  // (AGENTS.md "Privacy"); the coordinates are the same fact in another form,
  // so they go too. What survives is what actually diagnoses a bad geocode:
  // how many progressive queries it took, how specific the winner was, and the
  // country it landed in — enough to spot "resolved to the wrong continent"
  // without naming anyone's birthplace.
  console.debug(
    '[geocode] resolved',
    `parts=${parts.length}`,
    `type=${bestFeature.properties?.feature_type}`,
    // Only HERE's own country name goes to the console. `country` falls back to
    // `parts[parts.length - 1]`, and for a single-part place that IS the birth
    // place — echoing it would put GEDCOM text straight back in the log this
    // block exists to keep it out of.
    `country=${apiCountry ?? '<unresolved>'}`
  )

  return { lat, lng, country }
}

// Cache the in-flight promise, not just the settled result — ancestors
// sharing a birth place run concurrently, and each would otherwise miss
// the cache and issue its own duplicate API requests.
/**
 * Whether `place` is already resolved (or in flight) in the module cache, so
 * `geocodePlace` would answer without touching HERE.
 *
 * The terminal latch exists to stop spending requests, not to stop answering:
 * duplicate birth places are the norm in a family tree (siblings share one),
 * so a cached place must still resolve after the quota is gone. Without this,
 * one uncached 429 would blank markers that cost nothing to draw.
 */
function isCached(place: string): boolean {
  return cache.has(place)
}

function geocodePlace(
  place: string,
  onUnavailable?: (e: GeocoderUnavailableError) => void
): Promise<GeocodeResult | null> {
  const cached = cache.get(place)
  if (cached) return cached

  // A broad match kept after a TRANSIENT refinement failure is provisional:
  // the specific query may well succeed once connectivity returns, so caching
  // it as final would pin the ancestor to a region centroid for the rest of
  // the session. A terminal reason is the opposite — nothing better is coming
  // this month, so that result is as good as it gets and caching it is right.
  let provisional = false
  const note = (e: GeocoderUnavailableError) => {
    if (!isTerminal(e.reason)) provisional = true
    onUnavailable?.(e)
  }

  const promise = (async () => {
    const { parts, spaceParts } = splitPlace(place)

    let result = await tryGeocode(parts, hereSearch, note)
    if (!result && spaceParts) {
      result = await tryGeocode(spaceParts, hereSearch, note)
    }

    return result
      ? { lat: result.lat, lng: result.lng, country: result.country }
      : null
  })()
  promise.catch(() => cache.delete(place))
  cache.set(place, promise)
  // Evict once settled rather than never caching: concurrent ancestors in THIS
  // run still share the in-flight promise (no duplicate requests), while a
  // later run re-queries instead of inheriting the coarse answer.
  promise.then(
    () => {
      if (provisional) cache.delete(place)
    },
    () => {}
  )
  return promise
}

export interface GeocodeAncestorsOptions {
  concurrency?: number
}

export interface GeocodeAncestorsResult<T> {
  geocoded: (T & GeocodeResult)[]
  /** Looked up, and the place did not resolve. A fact about the place. */
  geocodeFailed: T[]
  /** Never looked up — the geocoder couldn't answer. A fact about us. */
  geocodeUnavailable: T[]
  /** Why, when `geocodeUnavailable` is non-empty. */
  unavailableReason?: GeocoderUnavailableReason
}

export async function geocodeAncestors<T extends { birthPlace: string | null }>(
  ancestors: T[],
  onProgress: (completed: number) => void,
  { concurrency = 5 }: GeocodeAncestorsOptions = {}
): Promise<GeocodeAncestorsResult<T>> {
  const geocoded: (T & GeocodeResult)[] = []
  const geocodeFailed: T[] = []
  const geocodeUnavailable: T[] = []
  let unavailableReason: GeocoderUnavailableReason | undefined
  let completed = 0

  // Once the geocoder is down for a reason that can't clear mid-batch — the
  // month's quota is gone, the key is bad, there is no key — every remaining
  // lookup is doomed. Latch, and spend no more requests proving it. A one-off
  // `network` failure does NOT latch: that can be a single blip, and
  // abandoning a whole tree over one 500 would lose ancestors we could map.
  let latched: GeocoderUnavailableReason | undefined

  // A 429 is ambiguous at the response (see `reasonForStatus`), so the latch
  // for it is earned rather than assumed. Each `rate-limited` note has already
  // survived its own retry, so several in a row without a single lookup
  // getting through is the evidence that the allowance is gone rather than
  // that we out-ran a burst limit. Any live success resets the count — one
  // that came off the cache proves nothing about the API and does not.
  let rateLimitedRun = 0
  const RATE_LIMIT_LATCH_THRESHOLD = 3

  // True while `latched` was inferred from the rate-limit streak rather than
  // read off a response. Only such a latch can be disproven and lifted.
  let latchedFromRateLimit = false

  // Ancestors the latch skipped, held rather than filed. A rate-limit latch
  // can be lifted by a lookup that was already in flight when it closed, and
  // by then the whole remaining queue has drained past it — every skip
  // completes without awaiting anything, so the tail is gone in a microtask,
  // long before a real request resolves. Filing them immediately would make
  // lifting the latch worth nothing.
  const deferredByLatch: T[] = []

  // Log the first occurrence of each distinct reason — once, not once per
  // ancestor, which would flood the console on a large tree. Sanitized: the
  // reason and status only, never the query (AGENTS.md "Privacy").
  const loggedReasons = new Set<GeocoderUnavailableReason>()
  function logOnce(e: GeocoderUnavailableError) {
    if (loggedReasons.has(e.reason)) return
    loggedReasons.add(e.reason)
    console.warn(
      `[geocode] lookup unavailable: ${e.reason}`,
      e.status ? `(HTTP ${e.status})` : '',
      isTerminal(e.reason) ? '- skipping remaining lookups' : '- continuing'
    )
  }

  // Record an availability failure: log it, latch when terminal, and decide
  // which reason the overlay reports. Called both when the error reaches the
  // catch below AND when tryGeocode survives one by falling back to a broad
  // match — the batch must latch either way, or the next ancestor pays for a
  // request we already know will fail.
  // The same error can arrive twice: `tryGeocode` reports it before rethrowing
  // (so a run that survives on a broad match still latches), and `processOne`
  // reports what it catches. Harmless while the latch was a boolean; counting
  // toward the rate-limit threshold makes it a double count, so dedupe by
  // identity rather than making either caller guess about the other.
  const noted = new WeakSet<GeocoderUnavailableError>()

  function noteUnavailable(e: GeocoderUnavailableError) {
    if (noted.has(e)) return
    noted.add(e)
    logOnce(e)
    if (e.reason === 'rate-limited') {
      rateLimitedRun++
      if (rateLimitedRun >= RATE_LIMIT_LATCH_THRESHOLD) {
        // Retried, repeatedly, with nothing getting through in between. Report
        // it as the allowance being gone, which is the remedy that differs.
        // Provisional, though: this is the one latch reached by *inference*
        // rather than from a response that says so, and a lookup already in
        // flight can still come back 2xx and disprove it.
        latched ??= 'quota'
        latchedFromRateLimit = true
        unavailableReason = 'quota'
        return
      }
    }
    if (isTerminal(e.reason)) {
      latched ??= e.reason
      // A terminal reason explains every remaining ancestor, so it supersedes
      // an earlier transient one. Concurrency means a one-off network blip can
      // land before the 429 that actually stopped the batch, and reporting the
      // blip would give the wrong remedy.
      if (!unavailableReason || !isTerminal(unavailableReason)) {
        unavailableReason = e.reason
      }
    } else {
      unavailableReason ??= e.reason
    }
  }

  async function processOne(ancestor: T) {
    // The latch skips the network, not the cache: a place already resolved
    // costs no request, so it must still map after the quota is gone.
    if (latched && !(ancestor.birthPlace && isCached(ancestor.birthPlace))) {
      // Held, not filed — see `deferredByLatch`. A terminal latch settles them
      // unchanged after the pass; a lifted one gets them retried.
      deferredByLatch.push(ancestor)
    } else {
      const fromCache = ancestor.birthPlace ? isCached(ancestor.birthPlace) : false
      const wentToNetwork = Boolean(ancestor.birthPlace) && !fromCache
      try {
        const coords = ancestor.birthPlace ? await geocodePlace(ancestor.birthPlace, noteUnavailable) : null
        // Reaching here at all means a live lookup completed normally, so we
        // are not rate limited right now and the run of 429s building toward a
        // latch is over. A confirmed no-match counts: `coords` is null but
        // HERE answered, which is the only thing the streak is measuring. A
        // cached hit does not — it never touched the API.
        if (wentToNetwork) {
          rateLimitedRun = 0
          // A live answer disproves an inferred quota latch, even one closed
          // moments ago by lookups from this same in-flight group: the
          // allowance cannot be spent if a request just succeeded. Lift it,
          // and fall back to reporting the rate limiting that did happen —
          // the ancestors already held are real, they just aren't evidence of
          // an exhausted allowance.
          if (latchedFromRateLimit) {
            latched = undefined
            latchedFromRateLimit = false
            unavailableReason = geocodeUnavailable.length > 0 ? 'rate-limited' : undefined
          }
        }
        if (coords) {
          geocoded.push({
            ...ancestor,
            lat: coords.lat,
            lng: coords.lng,
            country: coords.country,
          })
        } else {
          geocodeFailed.push(ancestor)
        }
      } catch (e) {
        if (e instanceof GeocoderUnavailableError) {
          // Couldn't look — not the same as looked-and-missed, so it must not
          // land in geocodeFailed and read to the user as a missing place.
          noteUnavailable(e)
          geocodeUnavailable.push(ancestor)
        } else {
          // A genuine bug in our own parse/pick path — surface it in the
          // console (sanitized: the error carries no place text) and treat
          // this ancestor as unmapped rather than dropping the whole run.
          console.error('[geocode] unexpected failure', e)
          geocodeFailed.push(ancestor)
        }
      }
    }
    completed++
    onProgress(completed)
  }

  // Process ancestors with bounded concurrency
  const executing = new Set<Promise<void>>()
  for (const ancestor of ancestors) {
    const p: Promise<void> = processOne(ancestor).then(() => {
      executing.delete(p)
    })
    executing.add(p)
    if (executing.size >= concurrency) {
      await Promise.race(executing)
    }
  }
  await Promise.all(executing)

  // Settle whatever the latch held back. If it was lifted while the pass was
  // draining, those ancestors were never actually tried — retry them once,
  // sequentially, so a re-latch stops the retry immediately rather than
  // spending the whole tail proving the same point again. One pass only: a
  // second latch is final.
  if (deferredByLatch.length > 0 && !latched) {
    const retrying = deferredByLatch.splice(0, deferredByLatch.length)
    for (const ancestor of retrying) {
      completed--
      await processOne(ancestor)
    }
  }
  for (const ancestor of deferredByLatch) geocodeUnavailable.push(ancestor)

  return { geocoded, geocodeFailed, geocodeUnavailable, unavailableReason }
}
