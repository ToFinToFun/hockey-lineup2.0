/**
 * Kampanjens logga som litet märke (Mustaschkampen i november) i matchrapporten,
 * laget.se-nyheten och Score Tracker. null = inget märke (fel månad eller ingen kampanj).
 */
import { trpc } from "@/lib/trpc";
import { isCampaignMonth } from "@shared/campaign";

export function useCampaignBadge(date?: Date | string | null): { name: string; logo: string } | null {
  const inMonth = isCampaignMonth(date ?? new Date());
  const q = trpc.campaign.badge.useQuery(undefined, { enabled: inMonth, staleTime: 30 * 60_000, retry: false });
  return inMonth && q.data?.logo ? { name: q.data.name, logo: q.data.logo } : null;
}
