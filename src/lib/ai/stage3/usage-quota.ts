import { AiError } from "@/lib/ai/client";

/** Only the explicit PostgreSQL quota exception is a 429.
 * Missing or unapplied migrations, broken grants and DB outages must be 503,
 * not misleading "please retry after an hour" responses.
 */
export function assertStage3QuotaReservation(
  eventId: unknown,
  error: {message?:string;code?:string}|null,
): asserts eventId is string {
  if(error){
    if(/\brate limit exceeded\b/i.test(error.message??"")){
      throw new AiError("rate_limited");
    }
    throw new AiError("quota_unavailable");
  }
  if(typeof eventId!=="string"||!eventId)throw new AiError("quota_unavailable");
}
