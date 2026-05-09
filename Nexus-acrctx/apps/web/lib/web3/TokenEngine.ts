import { BrowserProvider, Contract, formatUnits, parseUnits } from "ethers";

// Type definitions for window.ethereum
interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isMetaMask?: boolean;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

// Standard ERC-20 ABI for interacting with our Token
const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  // Custom minting function on our contract
  "function claimBounty(address user, uint256 amount) returns (bool)"
];

// Placeholder for our Polygon Amoy testnet contract address
export const STAAS_TOKEN_ADDRESS = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";

export class TokenEngine {
  private provider: BrowserProvider | null = null;

  constructor() {
    if (typeof window !== "undefined" && window.ethereum) {
      this.provider = new BrowserProvider(window.ethereum as never);
    }
  }

  /**
   * Prompts MetaMask to connect and returns the user's public address.
   */
  async connectWallet(): Promise<string | null> {
    if (!this.provider) throw new Error("MetaMask is not installed.");
    try {
      const accounts = await this.provider.send("eth_requestAccounts", []);
      return accounts[0];
    } catch (err) {
      console.error("[TokenEngine] Web3 Connection Failed:", err);
      return null;
    }
  }

  /**
   * Fetches the actual on-chain $STAAS balance for a given address.
   */
  async getBalance(address: string): Promise<string> {
    if (!this.provider) return "0.00";
    const contract = new Contract(STAAS_TOKEN_ADDRESS, ERC20_ABI, this.provider);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const balance = await (contract as any).balanceOf(address);
    // Assuming 18 decimals
    return formatUnits(balance, 18);
  }

  /**
   * Executes the Vampire Attack bounty claim transaction.
   * Prompts the user to sign the transaction via MetaMask to claim tokens
   * earned by migrating networks.
   */
  async claimBounty(amountToClaim: number): Promise<boolean> {
    if (!this.provider) throw new Error("MetaMask is not installed.");

    try {
      const signer = await this.provider.getSigner();
      const contract = new Contract(STAAS_TOKEN_ADDRESS, ERC20_ABI, signer);

      const parsedAmount = parseUnits(amountToClaim.toString(), 18);

      // Send the transaction to the network
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tx = await (contract as any).claimBounty(await signer.getAddress(), parsedAmount);
      console.log(`[TokenEngine] Claiming ${amountToClaim} $STAAS. TxHash: ${tx.hash}`);

      // Wait for 1 block confirmation
      const receipt = await tx.wait();
      console.log(`[TokenEngine] Tokens minted successfully in block ${receipt.blockNumber}`);
      return true;
    } catch (e) {
      console.error("[TokenEngine] Transaction rejected or failed:", e);
      return false;
    }
  }
}
