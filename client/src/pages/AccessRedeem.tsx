/** /a/:token – öppnar en delad länk med moduler och skickar vidare till startsidan. */
import { useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function AccessRedeem({ token }: { token: string }) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const redeem = trpc.auth.redeemAccess.useMutation({
    onSuccess: async () => {
      await utils.invalidate();
      navigate("/", { replace: true });
    },
  });
  useEffect(() => {
    if (token) redeem.mutate({ token });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="min-h-[100dvh] bg-[#0a0a0a] text-white flex items-center justify-center px-4 text-center">
      {redeem.isError ? (
        <div className="space-y-3">
          <p className="text-lg font-semibold">Länken fungerar inte</p>
          <p className="text-white/50 text-sm">{redeem.error.message}. Be styrelsen om en ny länk.</p>
          <a href="/" className="text-[#0a7ea4] text-sm">Till startsidan</a>
        </div>
      ) : (
        <Loader2 className="animate-spin text-white/40" />
      )}
    </div>
  );
}
