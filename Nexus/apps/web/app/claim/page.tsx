"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { TokenEngine } from "../../lib/web3/TokenEngine";
import { Wallet, Pickaxe, Flame, ChevronRight, ShieldCheck, Gem } from "lucide-react";
import { motion } from "framer-motion";

export default function ClaimPortal() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [balance, setBalance] = useState<string>("0.00");
  const [claimable, setClaimable] = useState<number>(0); // Simulated backend verification
  const [isClaiming, setIsClaiming] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [engine, setEngine] = useState<TokenEngine | null>(null);

  useEffect(() => {
    // Only initialize Web3 engine on client
    setEngine(new TokenEngine());
    
    // Simulate fetching off-chain verified bounties from Prisma DB
    // In production, the backend signs a cryptographic permit for the exact amount.
    setTimeout(() => setClaimable(1250), 1000);
  }, []);

  const connectMetaMask = async () => {
    if (!engine) return;
    const address = await engine.connectWallet();
    if (address) {
      setWallet(address);
      const currentBal = await engine.getBalance(address);
      setBalance(currentBal);
    } else {
      alert("MetaMask connection rejected or extremely congested network.");
    }
  };

  const handleClaim = async () => {
    if (!engine || !wallet || claimable <= 0) return;
    setIsClaiming(true);
    try {
      const success = await engine.claimBounty(claimable);
      if (success) {
        setTxHash("0x9c4f...a81e (Simulated Success on Polygon Amoy)");
        setBalance((parseInt(balance) + claimable).toString() + ".00");
        setClaimable(0);
      } else {
        alert("Transaction reverted on-chain. Ensure you have testnet MATIC for gas.");
      }
    } finally {
      setIsClaiming(false);
    }
  };

  return (
    <div className="relative w-full h-screen bg-[#050508] flex items-center justify-center overflow-hidden font-sans text-white">
      {/* Absolute Hex-Grid background overlay */}
      <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(var(--color-neon-purple) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      <div className="absolute top-1/4 left-1/4 w-[300px] h-[300px] bg-[var(--color-neon-blue)] opacity-20 blur-[120px] rounded-full pointer-events-none" />
      
      <div className="relative z-10 max-w-lg w-full px-6">
        
        {/* Header */}
        <div className="text-center mb-10">
          <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-[var(--color-neon-pink)] to-[var(--color-neon-purple)] flex items-center justify-center shadow-[0_0_20px_#ff007f] mb-4">
            <Flame size={28} className="text-white" />
          </motion.div>
          <h1 className="text-3xl font-black uppercase tracking-[0.2em] neon-text" style={{ textShadow: "0 0 15px var(--color-neon-purple)" }}>
            Vampire Attack
          </h1>
          <p className="text-sm text-gray-400 mt-2 font-mono uppercase tracking-widest">
            Extract network liquidity. Earn $STAAS.
          </p>
        </div>

        {/* Dashboard Box */}
        <div className="glass-panel p-8 rounded-3xl border border-white/10 relative overflow-hidden backdrop-blur-2xl bg-black/40">
          {!wallet ? (
            <div className="text-center space-y-6">
              <ShieldCheck size={40} className="mx-auto text-gray-500" />
              <div>
                <h2 className="text-lg font-bold text-white mb-2">Web3 Identity Required</h2>
                <p className="text-sm text-gray-400 leading-relaxed">
                  Authenticate via MetaMask to view your captured node bounties and mint $STAAS tokens natively onto Polygon.
                </p>
              </div>
              <button 
                onClick={connectMetaMask}
                className="w-full py-4 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 font-black uppercase tracking-widest text-sm transition-all flex items-center justify-center gap-3 hover:shadow-[0_0_15px_rgba(255,255,255,0.2)]"
              >
                <Wallet size={18} /> Connect Wallet
              </button>
            </div>
          ) : (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
              
              {/* Wallet Info */}
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[var(--color-neon-blue)]/20 flex items-center justify-center border border-[var(--color-neon-blue)]/40 text-[var(--color-neon-blue)]">
                    <Wallet size={14} />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Connected Node</p>
                    <p className="text-sm font-mono text-gray-200">{wallet.substring(0, 6)}...{wallet.substring(38)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">On-Chain Balance</p>
                  <p className="text-lg font-black text-[var(--color-neon-blue)] flex items-center justify-end gap-1">
                    {balance} <Gem size={12} />
                  </p>
                </div>
              </div>

              {/* Claim Box */}
              <div className="bg-[var(--color-background-dark)] rounded-2xl p-6 border border-white/5 shadow-inner flex flex-col items-center justify-center gap-3 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--color-neon-purple)] opacity-10 blur-3xl pointer-events-none" />
                <p className="text-sm text-gray-400 font-medium uppercase tracking-widest text-center">Unminted Network Bounties</p>
                <h2 className="text-5xl font-black text-white" style={{ textShadow: "0 0 20px rgba(255,255,255,0.2)" }}>
                  {claimable.toLocaleString()}
                </h2>
                <p className="text-xs text-green-400 font-bold bg-green-400/10 px-3 py-1 rounded-full uppercase tracking-wider mt-1">
                  Ready to mint on Polygon
                </p>
              </div>

              {/* Action Button */}
              {txHash ? (
                <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-center">
                  <ShieldCheck size={24} className="text-green-400 mx-auto mb-2" />
                  <p className="text-sm font-bold text-green-400 uppercase tracking-widest">Transaction Confirmed</p>
                  <p className="text-[10px] font-mono text-gray-400 mt-1 cursor-pointer hover:text-white transition-colors">{txHash}</p>
                </div>
              ) : (
                <button 
                  onClick={handleClaim}
                  disabled={isClaiming || claimable === 0}
                  className={`w-full py-4 rounded-xl font-black uppercase tracking-widest text-sm transition-all flex items-center justify-center gap-2 ${
                    isClaiming || claimable === 0 
                    ? "bg-gray-800 text-gray-600 cursor-not-allowed border-transparent"
                    : "bg-gradient-to-r from-[var(--color-neon-purple)] to-[var(--color-neon-pink)] text-white shadow-[0_0_20px_#ff007faa] hover:shadow-[0_0_30px_#ff007f] hover:scale-[1.02]"
                  }`}
                >
                  {isClaiming ? "Waiting for MetaMask..." : claimable === 0 ? "No Bounties Available" : "Mint $STAAS Tokens"}
                  {!isClaiming && claimable > 0 && <Pickaxe size={16} />}
                </button>
              )}
            </motion.div>
          )}
        </div>
        
        {/* Footer info */}
        <p className="text-center text-[10px] text-gray-600 mt-8 max-w-sm mx-auto font-medium uppercase tracking-widest leading-relaxed">
          Tokens are deployed on <span className="text-[var(--color-neon-purple)]">Polygon Amoy Testnet</span>. Contract Address requires signature validation to prevent sybil network attacks.
        </p>
      </div>
    </div>
  );
}
